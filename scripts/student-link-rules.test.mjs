import test from "node:test";
import assert from "node:assert/strict";
import {
  STUDENT_LINK_RESERVATION_TTL_MS,
  getCompletionFallbackOutcome,
  getReservationStatus,
} from "../supabase/functions/_shared/student-link-rules.mjs";

const NOW = Date.parse("2026-11-20T12:00:00.000Z");
const ATTEMPT = "a1111111-1111-4111-8111-111111111111";
const USER_A = "b2222222-2222-4222-8222-222222222222";
const USER_B = "c3333333-3333-4333-8333-333333333333";

test("reserva permanece ativa antes de completar 15 minutos", () => {
  const invitedAt = new Date(NOW - STUDENT_LINK_RESERVATION_TTL_MS + 1).toISOString();
  assert.equal(getReservationStatus(invitedAt, NOW), "active");
});

test("reserva expira exatamente aos 15 minutos", () => {
  const invitedAt = new Date(NOW - STUDENT_LINK_RESERVATION_TTL_MS).toISOString();
  assert.equal(getReservationStatus(invitedAt, NOW), "expired");
});

test("reserva com timestamp futuro é rejeitada", () => {
  const invitedAt = new Date(NOW + 1).toISOString();
  assert.equal(getReservationStatus(invitedAt, NOW), "future");
});

test("timestamp ausente ou inválido é rejeitado", () => {
  assert.equal(getReservationStatus(null, NOW), "invalid");
  assert.equal(getReservationStatus("", NOW), "invalid");
  assert.equal(getReservationStatus("data-inválida", NOW), "invalid");
});

test("confirmação repetida pela mesma conta é idempotente", () => {
  assert.equal(getCompletionFallbackOutcome({
    attemptId: ATTEMPT,
    userId: USER_A,
    completedAttemptId: ATTEMPT,
    completedUserId: USER_A,
  }), "already_completed");
});

test("outra conta ou outra tentativa recebe conflito", () => {
  assert.equal(getCompletionFallbackOutcome({
    attemptId: ATTEMPT,
    userId: USER_B,
    completedAttemptId: ATTEMPT,
    completedUserId: USER_A,
  }), "conflict");
  assert.equal(getCompletionFallbackOutcome({
    attemptId: ATTEMPT,
    userId: USER_A,
    completedAttemptId: "d4444444-4444-4444-8444-444444444444",
    completedUserId: USER_A,
  }), "conflict");
});

test("após uma corrida, somente a conta vencedora recebe sucesso idempotente", () => {
  // Representa a linha que o UPDATE condicional já gravou no banco.
  const persistedWinner = { invite_attempt_id: ATTEMPT, user_id: USER_A };
  const winnerRetry = getCompletionFallbackOutcome({
    attemptId: ATTEMPT,
    userId: USER_A,
    completedAttemptId: persistedWinner.invite_attempt_id,
    completedUserId: persistedWinner.user_id,
  });
  const otherAccount = getCompletionFallbackOutcome({
    attemptId: ATTEMPT,
    userId: USER_B,
    completedAttemptId: persistedWinner.invite_attempt_id,
    completedUserId: persistedWinner.user_id,
  });
  assert.equal(winnerRetry, "already_completed");
  assert.equal(otherAccount, "conflict");
});


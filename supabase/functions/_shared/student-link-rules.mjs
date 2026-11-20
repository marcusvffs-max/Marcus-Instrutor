export const STUDENT_LINK_RESERVATION_TTL_MS = 15 * 60 * 1000;

/**
 * Classifica uma reserva sem aceitar datas inválidas ou timestamps futuros.
 * O limite de 15 minutos é exclusivo: exatamente no limite, a reserva expirou.
 */
export function getReservationStatus(invitedAt, nowMs = Date.now()) {
  if (typeof invitedAt !== "string" || invitedAt.trim() === "") return "invalid";
  const reservationTime = new Date(invitedAt).getTime();
  if (!Number.isFinite(reservationTime)) return "invalid";

  const age = nowMs - reservationTime;
  if (age < 0) return "future";
  if (age >= STUDENT_LINK_RESERVATION_TTL_MS) return "expired";
  return "active";
}

/**
 * Decide se uma confirmação repetida pode ser reconhecida como idempotente.
 * Somente a mesma tentativa e a mesma conta autenticada recebem sucesso.
 */
export function getCompletionFallbackOutcome({
  attemptId,
  userId,
  completedAttemptId,
  completedUserId,
}) {
  if (
    typeof attemptId === "string" &&
    attemptId.length > 0 &&
    typeof userId === "string" &&
    userId.length > 0 &&
    completedAttemptId === attemptId &&
    completedUserId === userId
  ) {
    return "already_completed";
  }
  return "conflict";
}

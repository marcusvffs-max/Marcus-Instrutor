import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./supabase/functions/whatsapp-webhook/index.ts", import.meta.url), "utf8");

assert.match(source, /status:\s*"aguardando_escolha"[\s\S]{0,180}ultima_mensagem_em:\s*messageTime/);
assert.match(source, /let isNewConversation = false/);
assert.match(source, /isNewConversation = Boolean\(created && !createError\)/);
assert.match(source, /if \(isNewConversation \|\| conversationStatus === "aguardando"\)[\s\S]{0,1400}sendInitialMenuSelection\(supabase, conversation\.id, phone\);[\s\S]{0,100}continue;/);
assert.match(source, /reactivationGreeting/);
assert.match(source, /customer_opened_assistant_menu/);

console.log("OK: first-contact and legacy aguardando routes are present.");

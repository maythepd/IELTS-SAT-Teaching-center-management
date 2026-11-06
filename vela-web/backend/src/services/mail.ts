import { query } from '../database/db_connection.ts';
import { seal } from '../utils/security.ts';
export async function queueMail(recipient, subject, body, key, kind = 'NOTICE', parentId = null, tx = null) {
  await query(`IF NOT EXISTS(SELECT 1 FROM email_outbox WITH(UPDLOCK,HOLDLOCK) WHERE dedupe_key=@key)
 INSERT email_outbox(kind,parent_id,recipient,subject,protected_payload,dedupe_key) VALUES(@kind,@parent,@recipient,@subject,@payload,@key)`, {
    kind,
    parent: parentId,
    recipient,
    subject,
    payload: seal({
      body
    }),
    key
  }, tx);
}

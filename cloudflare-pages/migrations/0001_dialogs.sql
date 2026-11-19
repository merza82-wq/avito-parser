CREATE TABLE dialogs (
  id TEXT PRIMARY KEY,
  profile TEXT NOT NULL,
  title TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  bot_id INTEGER NOT NULL,
  operator_id INTEGER NOT NULL
);

CREATE TABLE messages (
  dialog_id TEXT NOT NULL REFERENCES dialogs(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  body TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing', 'unknown')),
  sent_at INTEGER NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (dialog_id, id)
);

CREATE INDEX messages_history ON messages(dialog_id, sent_at DESC, position DESC, id DESC);
CREATE INDEX dialogs_owner ON dialogs(bot_id, operator_id, id);

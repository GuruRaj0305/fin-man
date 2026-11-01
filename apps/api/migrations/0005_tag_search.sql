-- A tag is indexed once per workspace, regardless of transaction-history size.
-- Reference counts count transactions, including legacy arrays with repeated tags.
CREATE TABLE tags (
 id INTEGER PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 tag_key TEXT NOT NULL,
 name TEXT NOT NULL,
 uses INTEGER NOT NULL CHECK(uses>=0),
 UNIQUE(user_id,tag_key)
);
CREATE VIRTUAL TABLE tag_search USING fts5(scope,name,tokenize='trigram');

CREATE TRIGGER tags_search_insert AFTER INSERT ON tags
BEGIN
 INSERT INTO tag_search(rowid,scope,name) VALUES(NEW.id,'workspace:'||NEW.user_id||':',NEW.name);
END;
CREATE TRIGGER tags_search_delete AFTER DELETE ON tags
BEGIN
 DELETE FROM tag_search WHERE rowid=OLD.id;
END;

INSERT INTO tags(user_id,tag_key,name,uses)
 SELECT user_id,tag_key,min(name),count(*) FROM (
  SELECT t.user_id,t.id,lower(trim(j.value)) AS tag_key,min(trim(j.value)) AS name
  FROM transactions t,json_each(t.tags) j
  WHERE j.type='text' AND trim(j.value)<>''
  GROUP BY t.user_id,t.id,lower(trim(j.value))
 ) GROUP BY user_id,tag_key;

CREATE TRIGGER transactions_tags_insert AFTER INSERT ON transactions
BEGIN
 INSERT INTO tags(user_id,tag_key,name,uses)
  SELECT NEW.user_id,lower(trim(value)),min(trim(value)),1
  FROM json_each(NEW.tags) WHERE type='text' AND trim(value)<>''
  GROUP BY lower(trim(value))
  ON CONFLICT(user_id,tag_key) DO UPDATE SET uses=uses+1;
END;
CREATE TRIGGER transactions_tags_delete AFTER DELETE ON transactions
BEGIN
 UPDATE tags SET uses=uses-1
  WHERE user_id=OLD.user_id AND tag_key IN (
   SELECT lower(trim(value)) FROM json_each(OLD.tags) WHERE type='text'
  );
 DELETE FROM tags WHERE user_id=OLD.user_id AND uses=0 AND tag_key IN (
  SELECT lower(trim(value)) FROM json_each(OLD.tags) WHERE type='text'
 );
END;
CREATE TRIGGER transactions_tags_update AFTER UPDATE OF tags ON transactions
WHEN NEW.tags<>OLD.tags
BEGIN
 -- Add first to preserve the canonical spelling for tags retained by an edit.
 INSERT INTO tags(user_id,tag_key,name,uses)
  SELECT NEW.user_id,lower(trim(value)),min(trim(value)),1
  FROM json_each(NEW.tags) WHERE type='text' AND trim(value)<>''
  GROUP BY lower(trim(value))
  ON CONFLICT(user_id,tag_key) DO UPDATE SET uses=uses+1;
 UPDATE tags SET uses=uses-1
  WHERE user_id=OLD.user_id AND tag_key IN (
   SELECT lower(trim(value)) FROM json_each(OLD.tags) WHERE type='text'
  );
 DELETE FROM tags WHERE user_id=OLD.user_id AND uses=0 AND tag_key IN (
  SELECT lower(trim(value)) FROM json_each(OLD.tags) WHERE type='text'
 );
END;

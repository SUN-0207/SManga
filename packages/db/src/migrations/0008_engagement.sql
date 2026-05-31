-- Phase D: view counters + rating table
-- Rollback: DROP TABLE rating; ALTER TABLE chapter DROP COLUMN view_count; ALTER TABLE story DROP COLUMN view_count;

ALTER TABLE story ADD COLUMN view_count integer NOT NULL DEFAULT 0;
ALTER TABLE chapter ADD COLUMN view_count integer NOT NULL DEFAULT 0;

CREATE TABLE rating (
  user_id   text     NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  story_id  uuid     NOT NULL REFERENCES story(id)  ON DELETE CASCADE,
  value     smallint NOT NULL CHECK (value BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, story_id)
);

CREATE INDEX rating_story_idx ON rating (story_id);

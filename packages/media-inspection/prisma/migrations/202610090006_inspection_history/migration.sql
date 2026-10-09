CREATE TABLE media_inspection_history (
 media_ref text NOT NULL, generation bigint NOT NULL, token uuid NOT NULL, fact jsonb NOT NULL,
 PRIMARY KEY(media_ref,generation,token), FOREIGN KEY(media_ref,generation) REFERENCES media_inspection(media_ref,generation)
);

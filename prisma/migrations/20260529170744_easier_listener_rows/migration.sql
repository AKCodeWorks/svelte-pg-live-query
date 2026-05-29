-- Normalize notify payload shape so all operations use `row`
CREATE OR REPLACE FUNCTION notify_table_change() RETURNS trigger AS $$
DECLARE
    payload JSON;
BEGIN
    payload := json_build_object(
        'operation', TG_OP,
        'table', TG_TABLE_NAME,
        'row', CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE row_to_json(NEW) END
    );

    PERFORM pg_notify(TG_ARGV[0], payload::text);

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

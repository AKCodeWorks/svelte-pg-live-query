-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "authorId" INTEGER NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateFunction
CREATE OR REPLACE FUNCTION notify_table_change() RETURNS trigger AS $$
DECLARE
    payload JSON;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        payload := json_build_object(
            'operation', TG_OP,
            'table', TG_TABLE_NAME,
            'old', row_to_json(OLD)
        );
    ELSE
        payload := json_build_object(
            'operation', TG_OP,
            'table', TG_TABLE_NAME,
            'new', row_to_json(NEW)
        );
    END IF;

    PERFORM pg_notify(TG_ARGV[0], payload::text);

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- CreateTrigger
CREATE TRIGGER "user_notify_changes"
AFTER INSERT OR UPDATE OR DELETE ON "User"
FOR EACH ROW
EXECUTE FUNCTION notify_table_change('user_changes');

-- CreateTrigger
CREATE TRIGGER "post_notify_changes"
AFTER INSERT OR UPDATE OR DELETE ON "Post"
FOR EACH ROW
EXECUTE FUNCTION notify_table_change('post_changes');

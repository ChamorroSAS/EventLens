CREATE TABLE IF NOT EXISTS "media_pipeline_validation_report" (
    "id" UUID NOT NULL,
    "operation_id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "sample_size" INTEGER NOT NULL,
    "success_count" INTEGER NOT NULL,
    "failure_count" INTEGER NOT NULL,
    "median_ms" DOUBLE PRECISION,
    "p95_ms" DOUBLE PRECISION,
    "meets_slo" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "observations" JSONB NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "media_pipeline_validation_report_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "media_pipeline_validation_report_operation_id_key" ON "media_pipeline_validation_report"("operation_id");

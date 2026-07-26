-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "contact_email" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_superuser" BOOLEAN NOT NULL DEFAULT false,
    "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_hr" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parent_department_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "department_id" UUID,
    "manager_id" UUID,
    "user_id" UUID,
    "employee_code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "employment_type" TEXT,
    "designation" TEXT,
    "joining_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "exit_date" DATE,
    "exit_reason" TEXT,
    "current_work" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frameworks" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "frameworks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controls" (
    "id" UUID NOT NULL,
    "framework_id" UUID NOT NULL,
    "control_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "controls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkpoints" (
    "id" UUID NOT NULL,
    "framework_id" UUID NOT NULL,
    "control_id" UUID NOT NULL,
    "checkpoint_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "guidance" TEXT,
    "evidence_required" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "department_id" UUID,
    "owner_id" UUID,
    "policy_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "use_in_scope" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_register" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "policy_id" UUID,
    "policy_code" TEXT NOT NULL,
    "policy_name" TEXT NOT NULL,
    "department_id" UUID,
    "owner_id" UUID,
    "linked_framework_id" UUID,
    "linked_control_id" UUID,
    "linked_kpi_id" UUID,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "effective_date" DATE,
    "next_review_date" DATE,
    "approval_status" TEXT NOT NULL DEFAULT 'pending',
    "review_status" TEXT NOT NULL DEFAULT 'pending',
    "evidence_status" TEXT NOT NULL DEFAULT 'pending',
    "uploaded_document_id" UUID,
    "reviewer_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),
    "remarks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "policy_register_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpis" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "kpi_code" TEXT NOT NULL,
    "kpi_name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'higher_is_better',
    "frequency" TEXT NOT NULL DEFAULT 'monthly',
    "default_data_source" TEXT,
    "owner_suggestion" TEXT,
    "source" TEXT,
    "owner_text" TEXT,
    "owner_id" UUID,
    "department_id" UUID,
    "use_in_scope" BOOLEAN NOT NULL DEFAULT true,
    "compliance_framework_mapping_text" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "kpis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_targets" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "kpi_id" UUID NOT NULL,
    "target_value" DECIMAL(18,4) NOT NULL,
    "target_period" TEXT,
    "target_source" TEXT,
    "frequency" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "owner_id" UUID,
    "department_id" UUID,
    "approval_status" TEXT NOT NULL DEFAULT 'pending',
    "effective_from" DATE,
    "effective_to" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "kpi_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_actuals" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "kpi_id" UUID NOT NULL,
    "kpi_target_id" UUID,
    "period" TEXT NOT NULL,
    "target_value" DECIMAL(18,4) NOT NULL,
    "actual_value" DECIMAL(18,4) NOT NULL,
    "variance" DECIMAL(18,4) NOT NULL,
    "rag_status" TEXT NOT NULL DEFAULT 'amber',
    "approval_status" TEXT NOT NULL DEFAULT 'pending',
    "evidence_required" BOOLEAN NOT NULL DEFAULT true,
    "comments" TEXT,
    "submitted_by" UUID,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "kpi_actuals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_framework_mapping" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "kpi_id" UUID NOT NULL,
    "framework_id" UUID NOT NULL,
    "control_id" UUID,
    "policy_id" UUID,
    "rule_text" TEXT,
    "evidence_required" BOOLEAN NOT NULL DEFAULT true,
    "mapping_status" TEXT NOT NULL DEFAULT 'active',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "kpi_framework_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_documents" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "evidence_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "evidence_type" TEXT,
    "file_name" TEXT NOT NULL,
    "original_file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT,
    "file_hash" TEXT,
    "uploaded_by" UUID,
    "owner_id" UUID,
    "approval_status" TEXT NOT NULL DEFAULT 'pending',
    "reviewer_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "remarks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "evidence_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_links" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "evidence_document_id" UUID NOT NULL,
    "linked_entity_type" TEXT NOT NULL,
    "linked_entity_id" UUID NOT NULL,
    "link_reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "evidence_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gaps" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "gap_code" TEXT NOT NULL,
    "source_type" TEXT,
    "source_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "department_id" UUID,
    "owner_id" UUID,
    "due_date" DATE,
    "closed_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capa" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "capa_code" TEXT NOT NULL,
    "gap_id" UUID,
    "title" TEXT NOT NULL,
    "root_cause" TEXT,
    "corrective_action" TEXT,
    "preventive_action" TEXT,
    "owner_id" UUID,
    "due_date" DATE,
    "closure_evidence_required" BOOLEAN NOT NULL DEFAULT true,
    "closure_evidence_status" TEXT NOT NULL DEFAULT 'pending',
    "closed_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "capa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risks" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "risk_code" TEXT NOT NULL,
    "risk_title" TEXT NOT NULL,
    "risk_description" TEXT,
    "department_id" UUID,
    "owner_id" UUID,
    "probability" INTEGER NOT NULL DEFAULT 1,
    "impact" INTEGER NOT NULL DEFAULT 1,
    "risk_score" INTEGER NOT NULL DEFAULT 1,
    "risk_level" TEXT NOT NULL DEFAULT 'low',
    "mitigation_plan" TEXT,
    "due_date" DATE,
    "closed_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookups" (
    "id" UUID NOT NULL,
    "client_id" UUID,
    "category" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lookups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_trail" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "user_id" UUID,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "record_id" UUID,
    "old_value" JSONB,
    "new_value" JSONB,
    "status" TEXT NOT NULL DEFAULT 'recorded',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_trail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clients_slug_key" ON "clients"("slug");

-- CreateIndex
CREATE INDEX "clients_status_idx" ON "clients"("status");

-- CreateIndex
CREATE INDEX "users_client_id_idx" ON "users"("client_id");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "users_client_id_email_key" ON "users"("client_id", "email");

-- CreateIndex
CREATE INDEX "roles_client_id_idx" ON "roles"("client_id");

-- CreateIndex
CREATE INDEX "roles_status_idx" ON "roles"("status");

-- CreateIndex
CREATE UNIQUE INDEX "roles_client_id_name_key" ON "roles"("client_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permissions_status_idx" ON "permissions"("status");

-- CreateIndex
CREATE INDEX "user_roles_client_id_idx" ON "user_roles"("client_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "user_roles"("user_id", "role_id");

-- CreateIndex
CREATE INDEX "role_permissions_client_id_idx" ON "role_permissions"("client_id");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE INDEX "departments_client_id_idx" ON "departments"("client_id");

-- CreateIndex
CREATE INDEX "departments_status_idx" ON "departments"("status");

-- CreateIndex
CREATE INDEX "departments_parent_department_id_idx" ON "departments"("parent_department_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_client_id_code_key" ON "departments"("client_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_user_id_key" ON "employees"("user_id");

-- CreateIndex
CREATE INDEX "employees_client_id_idx" ON "employees"("client_id");

-- CreateIndex
CREATE INDEX "employees_department_id_idx" ON "employees"("department_id");

-- CreateIndex
CREATE INDEX "employees_manager_id_idx" ON "employees"("manager_id");

-- CreateIndex
CREATE INDEX "employees_status_idx" ON "employees"("status");

-- CreateIndex
CREATE UNIQUE INDEX "employees_client_id_employee_code_key" ON "employees"("client_id", "employee_code");

-- CreateIndex
CREATE INDEX "frameworks_status_idx" ON "frameworks"("status");

-- CreateIndex
CREATE UNIQUE INDEX "frameworks_code_version_key" ON "frameworks"("code", "version");

-- CreateIndex
CREATE INDEX "controls_framework_id_idx" ON "controls"("framework_id");

-- CreateIndex
CREATE INDEX "controls_status_idx" ON "controls"("status");

-- CreateIndex
CREATE UNIQUE INDEX "controls_framework_id_control_code_key" ON "controls"("framework_id", "control_code");

-- CreateIndex
CREATE INDEX "checkpoints_framework_id_idx" ON "checkpoints"("framework_id");

-- CreateIndex
CREATE INDEX "checkpoints_control_id_idx" ON "checkpoints"("control_id");

-- CreateIndex
CREATE INDEX "checkpoints_status_idx" ON "checkpoints"("status");

-- CreateIndex
CREATE UNIQUE INDEX "checkpoints_control_id_checkpoint_code_key" ON "checkpoints"("control_id", "checkpoint_code");

-- CreateIndex
CREATE INDEX "policies_client_id_idx" ON "policies"("client_id");

-- CreateIndex
CREATE INDEX "policies_department_id_idx" ON "policies"("department_id");

-- CreateIndex
CREATE INDEX "policies_status_idx" ON "policies"("status");

-- CreateIndex
CREATE UNIQUE INDEX "policies_client_id_policy_code_key" ON "policies"("client_id", "policy_code");

-- CreateIndex
CREATE INDEX "policy_register_client_id_idx" ON "policy_register"("client_id");

-- CreateIndex
CREATE INDEX "policy_register_status_idx" ON "policy_register"("status");

-- CreateIndex
CREATE INDEX "policy_register_approval_status_idx" ON "policy_register"("approval_status");

-- CreateIndex
CREATE UNIQUE INDEX "policy_register_client_id_policy_code_version_key" ON "policy_register"("client_id", "policy_code", "version");

-- CreateIndex
CREATE INDEX "kpis_client_id_idx" ON "kpis"("client_id");

-- CreateIndex
CREATE INDEX "kpis_status_idx" ON "kpis"("status");

-- CreateIndex
CREATE INDEX "kpis_kpi_code_idx" ON "kpis"("kpi_code");

-- CreateIndex
CREATE INDEX "kpis_department_id_idx" ON "kpis"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpis_client_id_kpi_code_key" ON "kpis"("client_id", "kpi_code");

-- CreateIndex
CREATE INDEX "kpi_targets_client_id_idx" ON "kpi_targets"("client_id");

-- CreateIndex
CREATE INDEX "kpi_targets_kpi_id_idx" ON "kpi_targets"("kpi_id");

-- CreateIndex
CREATE INDEX "kpi_targets_status_idx" ON "kpi_targets"("status");

-- CreateIndex
CREATE INDEX "kpi_actuals_client_id_idx" ON "kpi_actuals"("client_id");

-- CreateIndex
CREATE INDEX "kpi_actuals_kpi_id_idx" ON "kpi_actuals"("kpi_id");

-- CreateIndex
CREATE INDEX "kpi_actuals_approval_status_idx" ON "kpi_actuals"("approval_status");

-- CreateIndex
CREATE INDEX "kpi_actuals_status_idx" ON "kpi_actuals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_actuals_client_id_kpi_id_period_key" ON "kpi_actuals"("client_id", "kpi_id", "period");

-- CreateIndex
CREATE INDEX "kpi_framework_mapping_client_id_idx" ON "kpi_framework_mapping"("client_id");

-- CreateIndex
CREATE INDEX "kpi_framework_mapping_kpi_id_idx" ON "kpi_framework_mapping"("kpi_id");

-- CreateIndex
CREATE INDEX "kpi_framework_mapping_framework_id_idx" ON "kpi_framework_mapping"("framework_id");

-- CreateIndex
CREATE INDEX "kpi_framework_mapping_status_idx" ON "kpi_framework_mapping"("status");

-- CreateIndex
CREATE INDEX "evidence_documents_client_id_idx" ON "evidence_documents"("client_id");

-- CreateIndex
CREATE INDEX "evidence_documents_approval_status_idx" ON "evidence_documents"("approval_status");

-- CreateIndex
CREATE INDEX "evidence_documents_status_idx" ON "evidence_documents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_documents_client_id_evidence_code_key" ON "evidence_documents"("client_id", "evidence_code");

-- CreateIndex
CREATE INDEX "evidence_links_client_id_idx" ON "evidence_links"("client_id");

-- CreateIndex
CREATE INDEX "evidence_links_linked_entity_type_linked_entity_id_idx" ON "evidence_links"("linked_entity_type", "linked_entity_id");

-- CreateIndex
CREATE INDEX "evidence_links_status_idx" ON "evidence_links"("status");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_links_client_id_evidence_document_id_linked_entity_key" ON "evidence_links"("client_id", "evidence_document_id", "linked_entity_type", "linked_entity_id");

-- CreateIndex
CREATE INDEX "gaps_client_id_idx" ON "gaps"("client_id");

-- CreateIndex
CREATE INDEX "gaps_status_idx" ON "gaps"("status");

-- CreateIndex
CREATE INDEX "gaps_department_id_idx" ON "gaps"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "gaps_client_id_gap_code_key" ON "gaps"("client_id", "gap_code");

-- CreateIndex
CREATE INDEX "capa_client_id_idx" ON "capa"("client_id");

-- CreateIndex
CREATE INDEX "capa_status_idx" ON "capa"("status");

-- CreateIndex
CREATE INDEX "capa_gap_id_idx" ON "capa"("gap_id");

-- CreateIndex
CREATE UNIQUE INDEX "capa_client_id_capa_code_key" ON "capa"("client_id", "capa_code");

-- CreateIndex
CREATE INDEX "risks_client_id_idx" ON "risks"("client_id");

-- CreateIndex
CREATE INDEX "risks_status_idx" ON "risks"("status");

-- CreateIndex
CREATE INDEX "risks_department_id_idx" ON "risks"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "risks_client_id_risk_code_key" ON "risks"("client_id", "risk_code");

-- CreateIndex
CREATE INDEX "lookups_client_id_idx" ON "lookups"("client_id");

-- CreateIndex
CREATE INDEX "lookups_category_idx" ON "lookups"("category");

-- CreateIndex
CREATE INDEX "lookups_status_idx" ON "lookups"("status");

-- CreateIndex
CREATE UNIQUE INDEX "lookups_client_id_category_code_key" ON "lookups"("client_id", "category", "code");

-- CreateIndex
CREATE INDEX "audit_trail_client_id_idx" ON "audit_trail"("client_id");

-- CreateIndex
CREATE INDEX "audit_trail_module_idx" ON "audit_trail"("module");

-- CreateIndex
CREATE INDEX "audit_trail_record_id_idx" ON "audit_trail"("record_id");

-- CreateIndex
CREATE INDEX "audit_trail_created_at_idx" ON "audit_trail"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controls" ADD CONSTRAINT "controls_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_control_id_fkey" FOREIGN KEY ("control_id") REFERENCES "controls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_register" ADD CONSTRAINT "policy_register_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_register" ADD CONSTRAINT "policy_register_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpis" ADD CONSTRAINT "kpis_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_targets" ADD CONSTRAINT "kpi_targets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_targets" ADD CONSTRAINT "kpi_targets_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "kpis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_actuals" ADD CONSTRAINT "kpi_actuals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_actuals" ADD CONSTRAINT "kpi_actuals_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "kpis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_actuals" ADD CONSTRAINT "kpi_actuals_kpi_target_id_fkey" FOREIGN KEY ("kpi_target_id") REFERENCES "kpi_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_framework_mapping" ADD CONSTRAINT "kpi_framework_mapping_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_framework_mapping" ADD CONSTRAINT "kpi_framework_mapping_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "kpis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_framework_mapping" ADD CONSTRAINT "kpi_framework_mapping_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_framework_mapping" ADD CONSTRAINT "kpi_framework_mapping_control_id_fkey" FOREIGN KEY ("control_id") REFERENCES "controls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_documents" ADD CONSTRAINT "evidence_documents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_evidence_document_id_fkey" FOREIGN KEY ("evidence_document_id") REFERENCES "evidence_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gaps" ADD CONSTRAINT "gaps_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capa" ADD CONSTRAINT "capa_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capa" ADD CONSTRAINT "capa_gap_id_fkey" FOREIGN KEY ("gap_id") REFERENCES "gaps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lookups" ADD CONSTRAINT "lookups_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_trail" ADD CONSTRAINT "audit_trail_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;



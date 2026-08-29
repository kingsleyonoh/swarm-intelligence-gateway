CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "agent_episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"simulation_id" uuid NOT NULL,
	"agent_id" integer NOT NULL,
	"round_number" integer NOT NULL,
	"action_type" varchar(50) NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(384),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"simulation_id" uuid NOT NULL,
	"agent_id" integer NOT NULL,
	"username" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"bio" text,
	"persona" text NOT NULL,
	"entity_class" varchar(100),
	"stance" varchar(50),
	"influence_weight" numeric(5, 4) DEFAULT '0.5',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_agent_profiles_sim_agent" UNIQUE("simulation_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "graph_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"simulation_id" uuid NOT NULL,
	"source_node_id" uuid NOT NULL,
	"target_node_id" uuid NOT NULL,
	"edge_type" varchar(100) NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"weight" numeric(5, 4) DEFAULT '1.0',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graph_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"simulation_id" uuid NOT NULL,
	"entity_id" varchar(255) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"name" varchar(500) NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embedding" vector(384),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_graph_nodes_sim_entity" UNIQUE("simulation_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"simulation_id" uuid NOT NULL,
	"theater" varchar(255) NOT NULL,
	"prediction_type" varchar(100) NOT NULL,
	"summary" text NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"time_horizon" varchar(50) NOT NULL,
	"supporting_factions" jsonb,
	"dissenting_factions" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"worldmonitor_run_id" varchar(255),
	"title" varchar(500) NOT NULL,
	"theaters" jsonb NOT NULL,
	"entities" jsonb NOT NULL,
	"event_seeds" jsonb NOT NULL,
	"constraints" jsonb NOT NULL,
	"simulation_requirement" text NOT NULL,
	"source" varchar(50) DEFAULT 'poller' NOT NULL,
	"raw_package" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_scenarios_tenant_run" UNIQUE("tenant_id","worldmonitor_run_id")
);
--> statement-breakpoint
CREATE TABLE "simulations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"scenario_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"mirofish_project_id" varchar(255),
	"agent_count" integer DEFAULT 4096 NOT NULL,
	"round_count" integer DEFAULT 5 NOT NULL,
	"llm_provider" varchar(100) DEFAULT 'deepseek' NOT NULL,
	"seed_document" text,
	"report" text,
	"error_message" text,
	"cost_estimate_usd" numeric(10, 4),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"api_key_hash" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_api_key_hash_unique" UNIQUE("api_key_hash")
);
--> statement-breakpoint
ALTER TABLE "agent_episodes" ADD CONSTRAINT "agent_episodes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_episodes" ADD CONSTRAINT "agent_episodes_simulation_id_simulations_id_fk" FOREIGN KEY ("simulation_id") REFERENCES "public"."simulations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_simulation_id_simulations_id_fk" FOREIGN KEY ("simulation_id") REFERENCES "public"."simulations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_simulation_id_simulations_id_fk" FOREIGN KEY ("simulation_id") REFERENCES "public"."simulations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_source_node_id_graph_nodes_id_fk" FOREIGN KEY ("source_node_id") REFERENCES "public"."graph_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_target_node_id_graph_nodes_id_fk" FOREIGN KEY ("target_node_id") REFERENCES "public"."graph_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_nodes" ADD CONSTRAINT "graph_nodes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_nodes" ADD CONSTRAINT "graph_nodes_simulation_id_simulations_id_fk" FOREIGN KEY ("simulation_id") REFERENCES "public"."simulations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_simulation_id_simulations_id_fk" FOREIGN KEY ("simulation_id") REFERENCES "public"."simulations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_episodes_tenant_sim" ON "agent_episodes" USING btree ("tenant_id","simulation_id");--> statement-breakpoint
CREATE INDEX "idx_episodes_agent" ON "agent_episodes" USING btree ("simulation_id","agent_id","round_number");--> statement-breakpoint
CREATE INDEX "idx_profiles_sim" ON "agent_profiles" USING btree ("simulation_id");--> statement-breakpoint
CREATE INDEX "idx_graph_edges_tenant_sim" ON "graph_edges" USING btree ("tenant_id","simulation_id");--> statement-breakpoint
CREATE INDEX "idx_graph_edges_source" ON "graph_edges" USING btree ("source_node_id");--> statement-breakpoint
CREATE INDEX "idx_graph_nodes_tenant_sim" ON "graph_nodes" USING btree ("tenant_id","simulation_id");--> statement-breakpoint
CREATE INDEX "idx_graph_nodes_type" ON "graph_nodes" USING btree ("simulation_id","entity_type");--> statement-breakpoint
CREATE INDEX "idx_predictions_tenant" ON "predictions" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_predictions_confidence" ON "predictions" USING btree ("tenant_id","confidence");--> statement-breakpoint
CREATE INDEX "idx_scenarios_tenant" ON "scenarios" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_simulations_tenant" ON "simulations" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_simulations_status" ON "simulations" USING btree ("tenant_id","status");

ALTER TABLE "agent_episodes" ADD COLUMN "source_key" varchar(512);--> statement-breakpoint
ALTER TABLE "agent_episodes" ADD CONSTRAINT "uq_agent_episodes_sim_source" UNIQUE("simulation_id","source_key");--> statement-breakpoint
ALTER TABLE "graph_edges" ADD CONSTRAINT "uq_graph_edges_sim_relation" UNIQUE("simulation_id","source_node_id","target_node_id","edge_type");
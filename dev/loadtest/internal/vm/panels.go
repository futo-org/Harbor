package vm

import (
	"strings"
)

// Panel is one server-side chart on the dashboard. Queries use placeholders
// that Expand fills from Scope so the catalogue works for any Harbor cluster:
//
//	%C%   cluster matcher, e.g. cluster="harbor-infra-staging"
//	%NS%  all Harbor-related namespaces
//	%SRV% the harbor-server namespaces
//	%PG%  the Postgres namespace
//	%CT%  excludes pod-level and pause-container cadvisor series
type Panel struct {
	ID     string `json:"id"`
	Group  string `json:"group"`
	Title  string `json:"title"`
	Unit   string `json:"unit"` // cores, bytes, bytes/s, ratio, s, ms, ops/s, count
	Query  string `json:"query"`
	Legend string `json:"-"`
	Help   string `json:"help,omitempty"`
	// Component maps namespace/container labels onto short component names.
	Component bool `json:"-"`
}

// Scope selects which cluster/namespaces the catalogue queries.
type Scope struct {
	Cluster          string   `yaml:"cluster" json:"cluster"`
	Namespaces       []string `yaml:"namespaces" json:"namespaces"`
	ServerNamespaces []string `yaml:"serverNamespaces" json:"serverNamespaces"`
	PGNamespace      string   `yaml:"pgNamespace" json:"pgNamespace"`
}

func DefaultScope() Scope {
	return Scope{
		Cluster: "harbor-infra-staging",
		Namespaces: []string{
			"harbor-server", "harbor-server-alt", "harbor-pg", "kafka", "harbor-web",
			"harbor-moderation", "harbor-moderation-alt", "harbor-push-notifications",
			"harbor-scraper", "harbor-verifier-bot", "envoy-system",
		},
		ServerNamespaces: []string{"harbor-server", "harbor-server-alt"},
		PGNamespace:      "harbor-pg",
	}
}

// Expand substitutes scope placeholders into q.
func (s Scope) Expand(q string) string {
	return strings.NewReplacer(
		"%C%", `cluster="`+s.Cluster+`"`,
		"%NS%", `namespace=~"`+strings.Join(s.Namespaces, "|")+`"`,
		"%SRV%", `namespace=~"`+strings.Join(s.ServerNamespaces, "|")+`"`,
		"%PG%", `namespace="`+s.PGNamespace+`"`,
		"%CT%", `container!="", container!="POD"`,
	).Replace(q)
}

// ComponentName turns namespace/container into a short, stable label.
func ComponentName(ns, container string) string {
	switch ns {
	case "harbor-server":
		if container == "worker" {
			return "workers"
		}
		return "server"
	case "harbor-server-alt":
		if container == "worker" {
			return "alt workers"
		}
		return "alt server"
	case "harbor-pg":
		return "postgres"
	case "kafka":
		if container == "kafka" {
			return "kafka"
		}
		return "kafka ops"
	case "harbor-web":
		return "web"
	case "harbor-moderation":
		return "moderation"
	case "harbor-moderation-alt":
		return "alt moderation"
	case "harbor-push-notifications":
		return "push"
	case "harbor-scraper":
		return "scraper"
	case "harbor-verifier-bot":
		return "verifier"
	case "envoy-system":
		if strings.HasPrefix(container, "envoy") {
			return "envoy"
		}
		return "envoy ctl"
	}
	return strings.TrimPrefix(ns, "harbor-") + "/" + container
}

// DefaultPanels is the verified query catalogue for the Harbor staging
// cluster (30s scrape interval; the server's own latency histogram uses
// millisecond bucket bounds for second values, so server-side percentiles
// come from Envoy instead).
func DefaultPanels() []Panel {
	return []Panel{
		// Resources
		{ID: "cpu", Group: "Resources", Title: "CPU by component", Unit: "cores", Component: true,
			Query: `sum by (namespace, container) (rate(container_cpu_usage_seconds_total{%C%, %NS%, %CT%}[1m]))`},
		{ID: "mem", Group: "Resources", Title: "Memory working set by component", Unit: "bytes", Component: true,
			Query: `sum by (namespace, container) (container_memory_working_set_bytes{%C%, %NS%, %CT%})`},
		{ID: "cpu_pressure", Group: "Resources", Title: "CPU pressure (time waiting for CPU)", Unit: "s/s", Component: true,
			Help:  "PSI: seconds per second tasks were runnable but waiting. Harbor has no CPU limits, so this replaces throttling.",
			Query: `sum by (namespace, container) (rate(container_pressure_cpu_waiting_seconds_total{%C%, %NS%, %CT%}[1m]))`},
		{ID: "mem_limit", Group: "Resources", Title: "Memory vs limit (worst pod)", Unit: "ratio", Component: true,
			Query: `max by (namespace, container) (max by (namespace, pod, container) (container_memory_working_set_bytes{%C%, %NS%, %CT%}) / max by (namespace, pod, container) (kube_pod_container_resource_limits{%C%, %NS%, resource="memory"}))`},
		{ID: "node_cpu", Group: "Resources", Title: "Node CPU utilisation", Unit: "ratio", Legend: "{{instance}}",
			Query: `sum by (instance) (rate(container_cpu_usage_seconds_total{%C%, id="/"}[1m])) / on (instance) max by (instance) (machine_cpu_cores{%C%})`},
		{ID: "node_mem", Group: "Resources", Title: "Node memory utilisation", Unit: "ratio", Legend: "{{instance}}",
			Query: `max by (instance) (container_memory_working_set_bytes{%C%, id="/"}) / on (instance) max by (instance) (machine_memory_bytes{%C%})`},
		{ID: "net_rx", Group: "Resources", Title: "Network received", Unit: "bytes/s", Legend: "{{namespace}}",
			Query: `sum by (namespace) (rate(container_network_receive_bytes_total{%C%, %NS%, interface="eth0"}[1m]))`},
		{ID: "net_tx", Group: "Resources", Title: "Network sent", Unit: "bytes/s", Legend: "{{namespace}}",
			Query: `sum by (namespace) (rate(container_network_transmit_bytes_total{%C%, %NS%, interface="eth0"}[1m]))`},

		// Harbor server
		{ID: "envoy_rps", Group: "Server", Title: "Requests at the gateway", Unit: "ops/s", Legend: "{{route}} {{envoy_response_code_class}}xx",
			Query: `sum by (route, envoy_response_code_class) (label_replace(rate(envoy_cluster_upstream_rq_xx{%C%, envoy_cluster_name=~"httproute/harbor-.*"}[1m]), "route", "$1", "envoy_cluster_name", "httproute/([^/]+)/.*"))`},
		{ID: "envoy_p95", Group: "Server", Title: "Gateway upstream latency p95", Unit: "ms", Legend: "{{route}}",
			Query: `histogram_quantile(0.95, sum by (route, le) (label_replace(rate(envoy_cluster_upstream_rq_time_bucket{%C%, envoy_cluster_name=~"httproute/harbor-.*"}[1m]), "route", "$1", "envoy_cluster_name", "httproute/([^/]+)/.*")))`},
		{ID: "envoy_p99", Group: "Server", Title: "Gateway upstream latency p99", Unit: "ms", Legend: "{{route}}",
			Query: `histogram_quantile(0.99, sum by (route, le) (label_replace(rate(envoy_cluster_upstream_rq_time_bucket{%C%, envoy_cluster_name=~"httproute/harbor-.*"}[1m]), "route", "$1", "envoy_cluster_name", "httproute/([^/]+)/.*")))`},
		{ID: "envoy_active", Group: "Server", Title: "Gateway in-flight requests", Unit: "count", Legend: "{{route}}",
			Query: `sum by (route) (label_replace(envoy_cluster_upstream_rq_active{%C%, envoy_cluster_name=~"httproute/harbor-.*"} + envoy_cluster_upstream_rq_pending_active{%C%, envoy_cluster_name=~"httproute/harbor-.*"}, "route", "$1", "envoy_cluster_name", "httproute/([^/]+)/.*"))`},
		{ID: "srv_rps", Group: "Server", Title: "Server requests by RPC", Unit: "ops/s", Legend: "{{ns}} {{rpc}}",
			Query: `sum by (ns, rpc) (label_replace(label_replace(rate(http_server_requests_total{%C%, %SRV%, method!="OPTIONS"}[1m]), "rpc", "$1", "route", "/polycentric\\.v2\\.(.*)"), "ns", "$1", "namespace", "harbor-(.*)"))`},
		{ID: "srv_errors", Group: "Server", Title: "Server non-2xx responses", Unit: "ops/s", Legend: "{{namespace}} {{status}}",
			Query: `sum by (namespace, status) (rate(http_server_requests_total{%C%, %SRV%, status!~"2.."}[1m]))`},
		{ID: "srv_mean", Group: "Server", Title: "Server mean latency by RPC", Unit: "s", Legend: "{{ns}} {{rpc}}",
			Help:  "Mean from the server histogram (its percentiles are unusable: second values in millisecond buckets).",
			Query: `label_replace(label_replace(sum by (namespace, route) (rate(http_server_request_duration_seconds_sum{%C%, %SRV%, method!="OPTIONS"}[2m])) / sum by (namespace, route) (rate(http_server_request_duration_seconds_count{%C%, %SRV%, method!="OPTIONS"}[2m])), "rpc", "$1", "route", "/polycentric\\.v2\\.(.*)"), "ns", "$1", "namespace", "harbor-(.*)")`},
		{ID: "db_pool", Group: "Server", Title: "DB pool in use", Unit: "ratio", Legend: "{{namespace}} {{otel_scope_name}}",
			Query: `sum by (namespace, otel_scope_name) (db_pool_connections{%C%, state="used"}) / sum by (namespace, otel_scope_name) (db_pool_max_connections{%C%})`},

		// Postgres
		{ID: "pg_tps", Group: "Postgres", Title: "Transactions by database", Unit: "ops/s", Legend: "{{datname}}",
			Query: `sum by (datname) (rate(cnpg_pg_stat_database_xact_commit{%C%, %PG%, datname=~"harbor|harbor_server_alt|moderation|notifications|verifier_bot"}[1m]) + rate(cnpg_pg_stat_database_xact_rollback{%C%, %PG%, datname=~"harbor|harbor_server_alt|moderation|notifications|verifier_bot"}[1m]))`},
		{ID: "pg_backends", Group: "Postgres", Title: "Backends by state", Unit: "count", Legend: "{{pg_role}} {{state}}",
			Query: `sum by (pg_role, state) (cnpg_backends_total{%C%, %PG%})`},
		{ID: "pg_waiting", Group: "Postgres", Title: "Backends waiting on locks", Unit: "count", Legend: "{{pod}}",
			Query: `max by (pod) (cnpg_backends_waiting_total{%C%, %PG%})`},
		{ID: "pg_longest_tx", Group: "Postgres", Title: "Longest running transaction", Unit: "s", Legend: "{{pod}}",
			Query: `max by (pod) (cnpg_backends_max_tx_duration_seconds{%C%, %PG%})`},
		{ID: "pg_repl_lag", Group: "Postgres", Title: "Replica replay lag", Unit: "s", Legend: "{{application_name}}",
			Query: `max by (application_name) (cnpg_pg_stat_replication_replay_lag_seconds{%C%, %PG%})`},
		{ID: "pg_cache_hit", Group: "Postgres", Title: "Buffer cache hit ratio", Unit: "ratio", Legend: "{{pod}}",
			Query: `sum by (pod) (rate(cnpg_pg_stat_database_blks_hit{%C%, %PG%}[2m])) / (sum by (pod) (rate(cnpg_pg_stat_database_blks_hit{%C%, %PG%}[2m])) + sum by (pod) (rate(cnpg_pg_stat_database_blks_read{%C%, %PG%}[2m])))`},
		{ID: "pg_wal", Group: "Postgres", Title: "WAL written", Unit: "bytes/s", Legend: "{{pod}}",
			Query: `sum by (pod) (rate(cnpg_collector_wal_bytes{%C%, %PG%}[2m]))`},

		// Kafka & workers
		{ID: "kafka_lag", Group: "Kafka & workers", Title: "Consumer lag", Unit: "count", Legend: "{{consumergroup}}",
			Query: `sum by (consumergroup) (kafka_consumergroup_lag{%C%})`},
		{ID: "kafka_produce", Group: "Kafka & workers", Title: "Messages produced", Unit: "ops/s", Legend: "{{topic}}",
			Query: `sum by (topic) (rate(kafka_topic_partition_current_offset{%C%, topic=~"harbor-.*"}[2m]))`},
		{ID: "workers", Group: "Kafka & workers", Title: "Worker messages by outcome", Unit: "ops/s", Legend: "{{namespace}} {{group}} {{outcome}}",
			Query: `sum by (namespace, group, outcome) (rate(worker_messages_total{%C%}[1m]))`},

		// Health
		{ID: "restarts", Group: "Health", Title: "Container restarts (15m)", Unit: "count", Component: true,
			Query: `sum by (namespace, container) (increase(kube_pod_container_status_restarts_total{%C%, %NS%}[15m])) > 0`},
		{ID: "oom", Group: "Health", Title: "OOM kills (15m)", Unit: "count", Component: true,
			Query: `sum by (namespace, container) (increase(container_oom_events_total{%C%, %NS%, %CT%}[15m])) > 0`},
		{ID: "replicas", Group: "Health", Title: "Available / desired replicas", Unit: "ratio", Legend: "{{namespace}}/{{deployment}}",
			Query: `max by (namespace, deployment) (kube_deployment_status_replicas_available{%C%, %NS%}) / max by (namespace, deployment) (kube_deployment_spec_replicas{%C%, %NS%})`},
	}
}

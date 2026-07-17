// The predicate itself lives in @shopkeeper/agent so the gateway's operator
// inbox tools resolve the same set of threads the dashboard inbox shows.
export {
  canonicalInboxThreadWhere,
  canonicalInboxThreadSql,
} from "@shopkeeper/agent/inbox-filter"

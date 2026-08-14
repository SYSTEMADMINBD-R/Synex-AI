// Scheduled jobs. Guest-mode chats are ephemeral: this hourly sweep deletes
// conversations of anonymous users that haven't been touched in 24h, so
// nothing a guest typed can linger on the server even if they never sign out.
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sweep-abandoned-guest-data",
  { hours: 1 },
  internal.chat.cleanupGuestData,
);

export default crons;

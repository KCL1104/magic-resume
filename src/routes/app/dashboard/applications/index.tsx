import { createFileRoute } from "@tanstack/react-router";
import ApplicationsPage from "@/app/app/dashboard/applications/page";

export const Route = createFileRoute("/app/dashboard/applications/")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }],
  }),
  ssr: false,
  component: ApplicationsPage,
});

import { createFileRoute } from "@tanstack/react-router";
import ApplicationDetailPage from "@/app/app/dashboard/applications/[id]/page";

export const Route = createFileRoute("/app/dashboard/applications/$id")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }],
  }),
  ssr: false,
  component: ApplicationDetailRoute,
});

function ApplicationDetailRoute() {
  const { id } = Route.useParams();
  return <ApplicationDetailPage id={id} />;
}

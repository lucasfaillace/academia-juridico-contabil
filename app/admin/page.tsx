import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/AdminDashboard";
import { verifySession } from "@/lib/auth";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const token = (await cookies()).get("academia_session")?.value;
  if (!(await verifySession(token))) redirect("/admin/login");
  const { edit } = await searchParams;
  const initialArticleSlug = edit && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(edit) ? edit : undefined;
  return (
    <AdminDashboard
      defaultAuthorName={process.env.DEFAULT_AUTHOR_NAME || "Autor"}
      initialArticleSlug={initialArticleSlug}
    />
  );
}

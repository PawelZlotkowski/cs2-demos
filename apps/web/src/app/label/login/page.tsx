import { redirect } from "next/navigation";
import { LoginForm } from "@/components/labeler/LoginForm";
import { currentAccount } from "@/lib/labeler/server/session";
import { configurationProblem } from "@/lib/labeler/server/pages";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ ended?: string }> }) {
  const missing = configurationProblem();
  if (!missing.length) {
    const account = await currentAccount();
    if (account) redirect(account.role === "admin" ? "/label/admin" : "/label");
  }
  const { ended } = await searchParams;
  return (
    <main className="lb-login" id="content">
      <section className="lb-login-sheet sheet" aria-labelledby="login-title">
        <p className="lb-eyebrow">Round Reviewer clips</p>
        <h1 id="login-title">Review Counter-Strike clips</h1>
        <p className="lb-lead">Paste the personal access code you were sent. It keeps your notes on your own account.</p>
        {missing.length ? (
          <p className="lb-notice lb-notice-problem" role="alert">
            This site is still being set up, so sign-in is unavailable. Missing server settings: {missing.join(", ")}.
          </p>
        ) : (
          <LoginForm ended={ended === "1"} />
        )}
      </section>
    </main>
  );
}

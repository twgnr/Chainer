import ResetForm from "@/components/ResetForm";

export const metadata = { title: "Neues Passwort setzen" };

export default async function ResetTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ResetForm mode="confirm" token={token} />;
}

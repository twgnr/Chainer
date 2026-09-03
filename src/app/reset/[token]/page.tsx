import ResetForm from "@/components/ResetForm";
import { getT } from "@/lib/i18n/server";

const TXT = {
  en: { title: "Set a new password" },
  de: { title: "Neues Passwort setzen" },
};

export async function generateMetadata() {
  return { title: (await getT(TXT)).title };
}

export default async function ResetTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ResetForm mode="confirm" token={token} />;
}

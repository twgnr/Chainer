import ResetForm from "@/components/ResetForm";
import { getT } from "@/lib/i18n/server";

const TXT = {
  en: { title: "Forgotten password" },
  de: { title: "Passwort vergessen" },
};

export async function generateMetadata() {
  return { title: (await getT(TXT)).title };
}

export default function ResetPage() {
  return <ResetForm mode="request" />;
}

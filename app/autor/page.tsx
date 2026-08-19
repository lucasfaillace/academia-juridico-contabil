import { permanentRedirect } from "next/navigation";

export default function AuthorPage() {
  permanentRedirect("/sobre#fundador");
}

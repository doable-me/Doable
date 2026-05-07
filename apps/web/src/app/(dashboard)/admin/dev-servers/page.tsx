import { redirect } from "next/navigation";

export default function DevServersRedirect() {
  redirect("/admin/runtime");
}

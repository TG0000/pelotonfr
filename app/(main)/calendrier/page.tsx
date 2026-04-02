import { redirect } from "next/navigation";

// Redirect to courses page — the calendar view can be added as a tab later
export default function CalendrierPage() {
  redirect("/courses");
}

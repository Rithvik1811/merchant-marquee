import type { Metadata } from "next";
import Home from "./components/home/Home";

export const metadata: Metadata = {
  title: "Merchant Marquee — AI Product Video Studio",
  description:
    "Merchant Marquee reads your real product photos and has a team of AI agents script, shoot, and cut a short honest ad for your shop.",
};

export default function Page() {
  return <Home />;
}

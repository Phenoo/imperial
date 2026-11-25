import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function NotFound() {
  return <div className="shell subpage empty-state"><h1>We couldn’t find that shelf.</h1><p>The page may have moved, or the item may no longer be available.</p><Link className="button button-green" href="/shop">Back to the pantry <ArrowRight size={18}/></Link></div>;
}

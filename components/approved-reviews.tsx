import Image from "next/image";
import { getApprovedReviews } from "@/lib/business-server";

const displayDate = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeZone: "Africa/Lagos" });

export async function ApprovedReviews({ productId }: { productId?: string }) {
  const reviews = await getApprovedReviews(productId);
  if (!reviews.length) return null;
  const titleId = productId ? "product-customer-feedback" : "store-customer-feedback";
  return <section className="home-section" aria-labelledby={titleId}>
    <div className="section-heading"><h2 id={titleId}>Customer feedback</h2></div>
    <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {reviews.map((review) => <li key={review.id} className="form-card">
        {review.rating !== null && <p className="text-sm font-extrabold text-[var(--pine)]">{review.rating} out of 5</p>}
        <blockquote className="my-3 whitespace-pre-line break-words">{review.text}</blockquote>
        {review.photoUrl && <Image className="mb-3 w-full rounded-lg object-contain" src={review.photoUrl} alt={review.photoAlt} width={600} height={400} unoptimized/>}
        <p className="muted text-sm">
          {review.displayName && <>{review.displayName} · </>}
          <time dateTime={review.date}>{displayDate.format(new Date(review.date))}</time>
        </p>
      </li>)}
    </ul>
  </section>;
}

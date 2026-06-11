import { MongoService } from "@hushkey/mongo-service";
import { mongoDb } from "../connections.ts";
import { type Review, reviewsSchema } from "./reviews.schema.ts";

export class ReviewsService extends MongoService<Review> {
  constructor() {
    super(mongoDb!, reviewsSchema, { collectionName: "reviews" });
  }

  topForBlog(blogId: string, minRating = 4): Promise<Review[]> {
    return this.find({
      query: { blog_id: blogId, rating: { $gte: minRating } },
      sort: { rating: -1 },
    });
  }
}

// Mongo has no embedded fallback — without MONGO_URL the service is null and
// the review endpoints answer 503 with a setup hint.
export const reviewsService: ReviewsService = new ReviewsService();

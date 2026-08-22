import { db } from './index';
import { categories, people } from './schema';
import { DEFAULT_CATEGORIES, DEFAULT_PEOPLE } from '@/lib/defaults';

/** Gives a brand-new account its starting categories and the "Me" person. */
export async function bootstrapUser(userId: string): Promise<void> {
  await db.insert(categories).values(
    DEFAULT_CATEGORIES.map((c, i) => ({
      userId,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      color: c.color,
      kind: c.kind,
      sortOrder: i,
    })),
  );

  await db.insert(people).values(
    DEFAULT_PEOPLE.map((p, i) => ({
      userId,
      name: p.name,
      relationshipType: p.relationshipType,
      avatar: p.avatar,
      color: p.color,
      isSelf: p.isSelf,
      sortOrder: i,
    })),
  );
}

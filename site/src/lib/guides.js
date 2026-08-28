// The guide index.
//
// A page nothing links to accumulates none of the site's own authority, and
// eleven articles reachable only from the sitemap would be exactly that. The
// list is read from the Markdown itself so an article cannot be published
// without appearing here.
const files = import.meta.glob('../data/blog/*.md', { eager: true });

export const guides = Object.entries(files)
  .map(([file, mod]) => ({
    slug: file.split('/').pop().replace(/\.md$/, ''),
    title: mod.frontmatter.title,
    description: mod.frontmatter.description,
    published: mod.frontmatter.published,
  }))
  .sort((a, b) => a.title.localeCompare(b.title));

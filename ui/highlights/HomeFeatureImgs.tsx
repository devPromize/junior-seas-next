import Link from 'next/link';
import { twMerge } from 'tailwind-merge';

interface HomeFeatureImgsProps {
  src: string;
  alt?: string;
  className?: string; // styles the <img>
  wrapperClassName?: string; // styles the clickable wrapper (e.g. grid spans, overflow)
  searchQuery?: string; // 👈 this controls what it searches
}

const HomeFeatureImgs = ({
  src,
  alt,
  className,
  wrapperClassName,
  searchQuery,
}: HomeFeatureImgsProps) => {
  // Shared "this is clickable" affordance: subtle zoom + shadow on hover.
  const mergedClassName = twMerge(
    'rounded-2xl h-auto lg:h-full cursor-pointer transition duration-300 ease-out hover:scale-[1.02] hover:shadow-xl',
    className
  );

  const content = (
    <img
      src={src}
      alt={alt || src + ' hero'}
      className={mergedClassName}
      // below the fold on the homepage: eager images here get auto-preloaded and
      // compete with the hero carousel's LCP image
      loading="lazy"
      decoding="async"
    />
  );

  if (searchQuery) {
    return (
      <Link
        href={`/search?q=${encodeURIComponent(searchQuery)}`}
        aria-label={alt ? `Shop ${alt}` : 'Shop'}
        className={wrapperClassName}
      >
        {content}
      </Link>
    );
  }

  return <div className={wrapperClassName}>{content}</div>;
};

export default HomeFeatureImgs;

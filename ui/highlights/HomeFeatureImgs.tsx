import Link from 'next/link';
import { twMerge } from 'tailwind-merge';

interface HomeFeatureImgsProps {
  src: string;
  alt?: string;
  className?: string;
  searchQuery?: string; // 👈 this controls what it searches
}

const HomeFeatureImgs = ({
  src,
  alt,
  className,
  searchQuery,
}: HomeFeatureImgsProps) => {
  const mergedClassName = twMerge(
    'rounded-2xl h-auto lg:h-full cursor-pointer',
    className
  );

  const content = (
    <img
      src={src}
      alt={alt || src + 'hero'}
      className={mergedClassName}
    />
  );

  if (searchQuery) {
    return (
      <Link href={`/search?q=${encodeURIComponent(searchQuery)}`}>
        {content}
      </Link>
    );
  }

  return <div>{content}</div>;
};

export default HomeFeatureImgs;

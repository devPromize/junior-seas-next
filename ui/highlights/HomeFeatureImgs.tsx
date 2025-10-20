// import Image from 'next/image';
import { twMerge } from 'tailwind-merge';

interface HomeFeatureImgsProps {
  src: string;
  alt?: string;
  className?: string;
}
const HomeFeatureImgs = ({
  src,
  alt,
  className,
}: HomeFeatureImgsProps) => {
  const mergedClassName = twMerge(
    ' rounded-2xl h-auto lg:h-full',
    className
  );
  return (
    <div>
      <img
        // width={undefined}
        // height={undefined}
        src={src}
        alt={alt || src + 'hero'}
        className={mergedClassName}
      />
    </div>
  );
};

export default HomeFeatureImgs;

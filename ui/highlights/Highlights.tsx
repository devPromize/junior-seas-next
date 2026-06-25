'use client';

import Container from '../Container';
import { useAllHighlights } from '../../hooks/useHighlights';
import ProductHighlightBlock from './ProductHighlightBlock';
import ProductGridSkeleton from '../components/ProductGridSkeleton';
import HomeFeatureImgs from './HomeFeatureImgs';

interface HighlightSection {
  type: 'section';
  key: string;
  title: string;
}

interface HighlightImage {
  type: 'image' | 'image2';
}

type HighlightItem = HighlightSection | HighlightImage;

const highlightSections: HighlightItem[] = [
  { type: 'section', key: 'NEW AT JUNIOR SEAS', title: 'New at Junior Seas' },
  { type: 'image' },
  { type: 'section', key: 'POPULAR AT JUNIOR SEAS', title: 'Popular at Junior Seas' },
  { type: 'section', key: 'ONLY AT JUNIOR SEAS', title: 'Only at Junior Seas' },
  { type: 'image2' },
  { type: 'section', key: 'HOT DEALS AND SALES', title: 'Hot Deals & Sales' },
];

// ===== Helper Renderers for Reuse =====
const ImageGroupOne = () => (
  <Container>
    <div className="flex gap-4 flex-col md:flex-row bg-black/5 p-4  rounded-lg">
      <div className="flex gap-4">
        <HomeFeatureImgs src="/assets/js-imgs/Explore-ANC-Earphones-768x768.png" alt="ANC Earphones" searchQuery="earphones"/>
        <HomeFeatureImgs src="/assets/js-imgs/Home-Smart-Watches-768x768.png" alt="Smart Watches" searchQuery="smart watch" />
      </div>
      <HomeFeatureImgs src="/assets/js-imgs/uk-used-iphones-img.jpeg" alt="UK Used iPhones" searchQuery="iphones" />
    </div>
  </Container>
);

const ImageGroupTwo = () => (
  <Container>
    <div className="flex gap-4 flex-col md:flex-row">
      <HomeFeatureImgs src="/assets/js-imgs/S25-Ultra-Infographic-768x922.jpg" alt="S25 Ultra" searchQuery='S25 Ultra'/>
      <HomeFeatureImgs src="/assets/js-imgs/17-Pro-Max-Banner-for-Mobile.webp" alt="iPhone 17 Pro Max" searchQuery="iphone 17" />
      <HomeFeatureImgs src="/assets/js-imgs/Authentic-Apple-Accessories-768x922.png" alt="Apple Accessories" searchQuery="Apple" />
    </div>
  </Container>
);

const Highlights = () => {
  const { data: highlights, isLoading, isError } = useAllHighlights();

  // ====== LOADING STATE ======
  if (isLoading) {
    return (
      <div className="space-y-10">
        {highlightSections.map((item, i) => {
          if (item.type === 'section') {
            return (
              <div key={item.key ?? i}>
                <h2 className="text-xl md:text-2xl lg:text-3xl md:m-10 font-bold m-5 text-center underline decoration-yellow-500 underline-offset-8">
                  {item.title}.
                </h2>
                <ProductGridSkeleton count={12} />
              </div>
            );
          }
          if (item.type === 'image') return <ImageGroupOne key={`image1-${i}`} />;
          if (item.type === 'image2') return <ImageGroupTwo key={`image2-${i}`} />;
          return null;
        })}
      </div>
    );
  }

  // ====== ERROR STATE ======
  if (isError) {
    return <div className="text-center text-red-500">Failed to load highlights</div>;
  }

  // ====== SUCCESS STATE ======
  return (
    <div className="space-y-10">
      {highlightSections.map((item, index) => {
        if (item.type === 'section') {
          const products = highlights?.[item.key] ?? [];
          return (
            <ProductHighlightBlock
              key={item.key}
              sectionKey={item.key}
              title={item.title ?? 'Default Title'}
              products={products}
            />
          );
        }
        if (item.type === 'image') return <ImageGroupOne key={`image-${index}`} />;
        if (item.type === 'image2') return <ImageGroupTwo key={`image2-${index}`} />;
        return null;
      })}
    </div>
  );
};

export default Highlights;

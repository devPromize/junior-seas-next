'use client';
import { Swiper, SwiperSlide } from 'swiper/react';
// import 'swiper/css';
// import 'swiper/css/pagination';
// import 'swiper/css/navigation';
import {
  Autoplay,
  Pagination,
  Navigation,
} from 'swiper/modules';
import { useHeroCarousel } from '../hooks/useHeroCarousel';
import HeroCarouselSkeleton from './components/HeroCrouselSkeleton';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

interface Slide {
  id: number;
  image_url: string;
  title: string;
  description: string;
}

const HeroCarousel = () => {
  const { data = [], isLoading, error } = useHeroCarousel();

const router = useRouter();


const handleSlideClick = (title: string) => {
router.push(`/search?q=${encodeURIComponent(title)}`);
};

  return isLoading ? (
    <HeroCarouselSkeleton />
  ) : error ? (
    <p className="text-red-500">
      Something went wrong, Please Refresh Page
    </p>
  ) : (
    <div className="w-full h-[500px] relative overflow-hidden">
      <Swiper
        spaceBetween={0}
        slidesPerView={1}
        autoplay={{
          delay: 5000,
          disableOnInteraction: false,
        }}
        loop={true}
        pagination={{ clickable: true }}
        navigation={true}
        modules={[Autoplay, Pagination, Navigation]}
        className="h-full"
      >
        {data.map((slide: Slide) => (
          <SwiperSlide key={slide.id}>
            <Link href={`/search?q=${encodeURIComponent(slide.title)}`}>
              <div className="w-full h-[55vh] lg:h-[70vh] relative bg-[--color-columbia-blue]">
                <Image
                  fill
                  src={slide.image_url}
                  alt={slide.title}
                  className="w-full h-full object-cover object-center sm:object-right "
                   sizes="100vw"
  priority
                />
                <div className="absolute bottom-4 left-4 text-white bg-black/80 p-4 rounded-lg max-w-md">
                  <h2 className="text-lg font-bold">
                    {slide.title}
                  </h2>
                  <p className="text-sm">
                    {slide.description}
                  </p>
                </div>
              </div>
            </Link>
          </SwiperSlide>
        ))}
        <style>{`
          .swiper-button-prev,
          .swiper-button-next {
            color: black;
          }
          @media (max-width: 768px) {
            .swiper-button-prev,
            .swiper-button-next {
              display: none;
            }
          }
        `}</style>
      </Swiper>
    </div>
  );
};

export default HeroCarousel;

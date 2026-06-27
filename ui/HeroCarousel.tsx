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
              <div className="w-full h-[55vh] lg:h-[70vh] relative overflow-hidden bg-[--color-columbia-blue]">
                <Image
                  fill
                  src={slide.image_url}
                  alt={slide.title}
                  className="w-full h-full object-cover object-center sm:object-right brightness-105 saturate-[1.15]"
                  sizes="100vw"
                  priority
                />
                {/* gradient scrim: lifts the image and makes text readable without a hard black box */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />
                <div className="absolute bottom-6 left-6 right-6 sm:right-auto max-w-xl text-white drop-shadow-lg">
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight drop-shadow-md">
                    {slide.title}
                  </h2>
                  <p className="mt-1 text-sm sm:text-base text-white/90 drop-shadow">
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

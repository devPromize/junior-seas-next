'use client';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import {
  Autoplay,
  Pagination,
  Navigation,
} from 'swiper/modules';
import Link from 'next/link';
import Image from 'next/image';
import type { HeroSlide } from '@/lib/services/heroCarousel';

const HeroCarousel = ({
  slides,
}: {
  slides: HeroSlide[];
}) => {
  if (!slides.length) return null;

  return (
    <div className="w-full h-[55vh] lg:h-[70vh] relative overflow-hidden">
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
        {slides.map((slide, index) => (
          <SwiperSlide key={slide.id}>
            <Link href={`/search?q=${encodeURIComponent(slide.title)}`}>
              <div className="w-full h-[55vh] lg:h-[70vh] relative overflow-hidden bg-[--color-columbia-blue]">
                <Image
                  fill
                  src={slide.image_url}
                  alt={slide.title}
                  className="w-full h-full object-cover object-center sm:object-right brightness-105 saturate-[1.15]"
                  sizes="100vw"
                  // Only the first slide is the LCP candidate, so only it gets a
                  // preload. The rest still load eagerly — Swiper moves slides with
                  // transforms, and native lazy loading leaves them blank until they
                  // rotate in — but at low priority so they queue behind the LCP image.
                  priority={index === 0}
                  loading="eager"
                  fetchPriority={index === 0 ? 'high' : 'low'}
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
          /* Overlay the pagination bullets inside the image, near the bottom */
          .swiper-pagination {
            bottom: 16px !important;
            z-index: 20;
          }
          .swiper-pagination-bullet {
            background: #ffffff;
            opacity: 0.5;
            width: 9px;
            height: 9px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
            transition: opacity 0.2s ease, transform 0.2s ease;
          }
          .swiper-pagination-bullet-active {
            opacity: 1;
            transform: scale(1.25);
          }
        `}</style>
      </Swiper>
    </div>
  );
};

export default HeroCarousel;

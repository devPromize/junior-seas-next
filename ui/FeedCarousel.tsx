'use client';
import { useRef } from 'react';
import {
  Swiper as SwiperReact,
  SwiperSlide,
} from 'swiper/react';
import type { Swiper as SwiperClass } from 'swiper';

import {
  Autoplay,
  Navigation,
  Pagination,
  EffectCoverflow,
  A11y,
} from 'swiper/modules';
import {
  FaChevronLeft,
  FaChevronRight,
} from 'react-icons/fa';

import 'swiper/css';
import 'swiper/css/effect-coverflow';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

import { useFeedCarousel } from '../hooks/useFeedCarousel';
import Link from 'next/link';
import Image from 'next/image';

interface Slide {
  id: number;
  image_url: string;
  title: string;
  description: string;
}

const FeedCarousel = () => {
  const { data = [], isLoading, error } = useFeedCarousel();
  const swiperRef = useRef<SwiperClass | null>(null);

  const handlePrevClick = () => {
    swiperRef.current?.slidePrev();
  };

  const handleNextClick = () => {
    swiperRef.current?.slideNext();
  };

  return isLoading ? (
    <p>Loading...</p>
  ) : error ? (
    <p>Something went wrong</p>
  ) : (
    <div
      className="relative w-full h-[450px] px-4 group"
      onMouseEnter={() =>
        swiperRef.current?.autoplay?.stop()
      }
      onMouseLeave={() =>
        swiperRef.current?.autoplay?.start()
      }
      aria-roledescription="carousel"
      aria-label="Featured Products Carousel"
    >
      <h2 className="text-xl md:text-2xl lg:text-3xl font-bold m-5 mt-22 text-center underline decoration-yellow-500 underline-offset-8">
        Feed Carousel.
      </h2>

      <SwiperReact
        modules={[
          Autoplay,
          Navigation,
          Pagination,
          EffectCoverflow,
          A11y,
        ]}
        onSwiper={(swiper) => (swiperRef.current = swiper)}
        effect="coverflow"
        grabCursor={true}
        centeredSlides={true}
        loop={true}
        autoplay={{
          delay: 5000,
          disableOnInteraction: false,
        }}
        pagination={{ clickable: true }}
        coverflowEffect={{
          rotate: 30,
          stretch: 0,
          depth: 100,
          modifier: 1,
          slideShadows: true,
        }}
        a11y={{
          enabled: true,
          prevSlideMessage: 'Previous slide',
          nextSlideMessage: 'Next slide',
          firstSlideMessage: 'This is the first slide',
          lastSlideMessage: 'This is the last slide',
          slideLabelMessage: '{{index}} / {{slidesLength}}',
        }}
        breakpoints={{
          320: {
            slidesPerView: 1,
            spaceBetween: 0,
          },
          768: {
            slidesPerView: 2,
            spaceBetween: 0,
          },
          1024: {
            slidesPerView: 3,
            spaceBetween: 0,
          },
        }}
        className="w-full h-[400px]"
      >
        {data.map((slide: Slide) => (
          <SwiperSlide key={slide.id}>
<Link
  href={`/search?q=${encodeURIComponent(slide.title)}`}
  aria-label={`Search products related to ${slide.title}`}
>

              <div className="w-full h-full relative rounded-xl overflow-hidden shadow-lg">
                <Image
                  fill
                  src={slide.image_url}
                  alt={slide.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute bottom-4 left-4 text-white bg-black bg-opacity-60 p-4 rounded-lg max-w-md">
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
      </SwiperReact>

      {/* Custom Navigation */}
      <button
        onClick={handlePrevClick}
        className="hidden md:flex absolute left-0 top-1/2 transform -translate-y-1/2 z-10 bg-white text-black p-2 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition"
        aria-label="Previous slide"
      >
        <FaChevronLeft size={20} />
      </button>
      <button
        onClick={handleNextClick}
        className=" hidden md:flex absolute right-0 top-1/2 transform -translate-y-1/2 z-10 bg-white text-black p-2 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition"
        aria-label="Next slide"
      >
        <FaChevronRight size={20} />
      </button>
    </div>
  );
};

export default FeedCarousel;

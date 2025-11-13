'use client';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import 'swiper/css/free-mode';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import {
  FreeMode,
  Pagination,
  Autoplay,
  Navigation,
} from 'swiper/modules';
import { useRouter } from 'next/navigation';

// Brand Data
const brands = [
  { name: 'Apple', logo: '/assets/brandsLogos/apple.png' },
  {
    name: 'Dre Beats',
    logo: '/assets/brandsLogos/dreBeats.png',
  },
  {
    name: 'Gionee',
    logo: '/assets/brandsLogos/gionee.png',
  },
  {
    name: 'Harman Kardon',
    logo: '/assets/brandsLogos/harmanKardon.png',
  },
  { name: 'HP', logo: '/assets/brandsLogos/hp.png' },
  {
    name: 'Huawei',
    logo: '/assets/brandsLogos/huawei.png',
  },
  {
    name: 'Infinix',
    logo: '/assets/brandsLogos/infinix.png',
  },
  { name: 'Itel', logo: '/assets/brandsLogos/itel.png' },
  { name: 'JBL', logo: '/assets/brandsLogos/jbl.png' },
  {
    name: 'New Age',
    logo: '/assets/brandsLogos/newAge.png',
  },
  { name: 'Nokia', logo: '/assets/brandsLogos/nokia.png' },
  { name: 'Oppo', logo: '/assets/brandsLogos/oppo.png' },
  {
    name: 'Oraimo',
    logo: '/assets/brandsLogos/oraimo.png',
  },
  {
    name: 'PlayStation',
    logo: '/assets/brandsLogos/playstation.png',
  },
  {
    name: 'Poolee',
    logo: '/assets/brandsLogos/Poolee.png',
  },
  {
    name: 'Samsung',
    logo: '/assets/brandsLogos/samsung.png',
  },
  {
    name: 'SanDisk',
    logo: '/assets/brandsLogos/sanDisk.png',
  },
  { name: 'Tecno', logo: '/assets/brandsLogos/tecno.png' },
  { name: 'TG', logo: '/assets/brandsLogos/tg.png' },
  { name: 'Vivo', logo: '/assets/brandsLogos/vivo.png' },
  {
    name: 'Xiaomi',
    logo: '/assets/brandsLogos/xiaomi.png',
  },
  {
    name: 'Zealot',
    logo: '/assets/brandsLogos/zealot.png',
  },
  { name: 'ZTE', logo: '/assets/brandsLogos/zte.png' },
];

const BrandCarousel = () => {
  const router = useRouter();

  const handleBrandClick = (brand: string) => {
    router.push(`/brand/${brand.toLowerCase()}`);
  };

  return (
    <div className="w-full px-2 py-1 relative">
      <Swiper
        slidesPerView={3}
        slidesPerGroup={3}
        spaceBetween={5}
        freeMode={true}
        loop={true}
        autoplay={{
          delay: 5000,
          disableOnInteraction: false,
        }}
        navigation={true}
        speed={1500}
        breakpoints={{
          640: { slidesPerView: 3, spaceBetween: 10 },
          768: { slidesPerView: 4, spaceBetween: 15 },
          1024: { slidesPerView: 6, spaceBetween: 25 },
        }}
        modules={[
          FreeMode,
          Pagination,
          Autoplay,
          Navigation,
        ]}
        className="mySwiper"
      >
        {brands.map((brand) => (
          <SwiperSlide
            key={brand.name}
            className="flex justify-center "
          >
            <img
              src={brand.logo}
              alt={brand.name}
              className="w-50 h-auto object-contain cursor-pointer lg:grayscale hover:grayscale-0 hover:scale-120 transition-all duration-500 sm:grayscale-0"
              onClick={() => handleBrandClick(brand.name)}
            />
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

export default BrandCarousel;

'use client';

import Image from 'next/image';
import Link from 'next/link';

const perks = [
  {
    icon: '/assets/icons/expressDeliveryIcon.png',
    title: 'Fast Delivery',
    description:
      'Have your items delivered conveniently to your preferred location.',
    link: '/delivery',
    iconSize: 'w-20',
  },
  {
    icon: '/assets/icons/returnIcon.png',
    title: 'Hassle-Free Returns',
    description:
      "Easily return items that don't work as stated.",
    link: '/returns',
    iconSize: 'w-10',
  },
  {
    icon: '/assets/icons/customerSupportIcon.png',
    title: '24/7 Customer Support',
    description:
      'Get help and find answers to questions instantly.',
    link: '/contact-us',
    iconSize: 'w-10',
  },
];

const Perks = () => {
  return (
    <div
      className="flex gap-2 md:gap-5 items-start md:items-center justify-between p-3 md:p-7 mt-0
        hover:shadow-(--card-box-shadow) hover:transform-(--card-hover-transform) transition-transform duration-400 ease-in-out
         bg-white/50 backdrop-blur-sm border border-black/10 "
    >
      {perks.map((perk, index) => (
        <Link
          href={perk.link}
          key={index}
          className="flex flex-1 flex-col items-center justify-start gap-1 md:gap-2 text-center break-words"
        >
          <Image
            width={50}
            height={50}
            src={perk.icon}
            alt={perk.title}
            className={`${perk.iconSize} scale-75 md:scale-100`}
          />
          <h1 className="font-bold text-black text-xs md:text-base hover:text-(--color-black)/70 duration-200">
            {perk.title}
          </h1>
          <p className="text-center text-black text-[10px] leading-snug md:text-sm hover:text-(--color-black)/75 duration-200">
            {perk.description}
          </p>
        </Link>
      ))}
    </div>
  );
};

export default Perks;

"use client;";
import Link from "next/link";
import Container from "./Container";
import { FaEnvelope, FaPhone } from "react-icons/fa";
import {
  FaFacebook,
  FaInstagram,
  FaLinkedin,
  FaWhatsapp,
  FaTwitter,
  FaTiktok,
} from "react-icons/fa";

const customerService = [
  { title: "Warranty", to: "/warranty" },
  { title: "Delivery", to: "/delivery" },
  { title: "Returns", to: "/returns" },
];
const myAccount = [
  {
    title: "Login/Register",
    to: "/account/login-register",
  },
  { title: "Orders", to: "/account/orders" },
  { title: "Wishlist", to: "/wishlist" },
  { title: "Saved Address", to: "/account/saved-address" },
];

const support = [
  { title: "About Us", to: "/about-us" },
  { title: "Contact Us", to: "/contact-us" },
  { title: "Faqs", to: "/faqs" },
];

const Footer = () => {
  return (
    <div className="bg-(--color-navyBlue) text-(--color-white)">
      <Container
        className="flex flex-col md:flex-row 
       gap-5  justify-around"
      >
        <div className="flex flex-col justify-start mb-7">
          <div>
            <img
              src="/assets/icons/jsLogo.svg"
              alt="logo"
              className="w-50 invert"
            />
<div className="flex flex-col sm:flex-row">

  <a
    href="https://www.google.com/maps/search/?api=1&query=juniorseastechnologies+20+Urata+Street%2C+Owerri%2C+Imo+State"
    target="_blank"
    rel="noopener noreferrer"
    className="hover:underline"
  >
    20, Urata/Mann Street, Off Wetheral Road. <br />
    Owerri, Imo State, <br />
    Nigeria.
  </a>

  <div className="h-[0.1px] bg-(--color-skyBlue)/50 w-[150px] my-5 sm:w-[0.1px] sm:h-[75px] sm:mx-5 sm:my-0"></div>

 
  <a
    href="https://www.google.com/maps/search/?api=1&query=12+Tetlow+Road%2C+Owerri%2C+Imo+State"
    target="_blank"
    rel="noopener noreferrer"
    className="hover:underline"
  >
    12, Tetlow Road. <br />
    Owerri, Imo State, <br />
    Nigeria.
  </a>
</div>

          </div>
          <div className="py-2">
            <div className="flex items-center space-x-2">
              <FaEnvelope className="text-xl text-blue-500" />
              <span >
                {" "}
                <a
                  href="mailto:juniorseastecnologies@gmail.com?subject=Inquiry&body=Hello, I want to know more about..."
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  juniorseastecnologies@gmail.com
                </a>{" "}
              </span>
            </div>
            <div className="flex items-center space-x-2 pt-1">
              <FaPhone className="text-xl text-green-500" />
              <span className="flex gap-5">
                <a href="tel:+2348035057225">0803 505 7225,</a>
              <a href="sms:+2348106165292">0810 616 5292</a>
              </span>
              
            </div>
          </div>
        </div>

        <div className="flex justify-between gap-5 md:gap-10">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-bold">Account</h1>
            {myAccount.map(({ title, to }) => (
              <Link
                key={title}
                href={to}
                className="text-sm font-semibold text-[var(--color-white)]/70 hover:text-[var(--color-white)] hover:underline
            duration-200 relative overflow-hidden group cursor-pointer"
              >
                {title}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-bold">Services</h1>
            {customerService.map(({ title, to }) => (
              <Link
                key={title}
                href={to}
                className="text-sm font-semibold text-[var(--color-white)]/70 hover:text-[var(--color-white)] hover:underline
                        duration-200 relative overflow-hidden group cursor-pointer"
              >
                {title}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-bold">Support</h1>
            {support.map(({ title, to }) => (
              <Link
                key={title}
                href={to}
                className="text-sm font-semibold text-[var(--color-white)]/70 hover:text-(--color-white) hover:underline
                        duration-200 relative overflow-hidden group cursor-pointer"
              >
                {title}
              </Link>
            ))}
          </div>
        </div>
      </Container>
      <Container>
        <div className="h-0.5 bg-(--color-skyBlue)/50 w-full"></div>
        <div className="flex flex-col gap-2 items-center sm:flex-row justify-around md:flex-row pt-4">
          <p>@2025 Junior Seas. All Rights Reserved.</p>
          <div className="flex flex-col items-center gap-0 mb-5">
            <p>Need a Website?</p>
            <a
              href="https://ip-webcrafts.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Contact Me for Web Dev Services&#33;
            </a>
          </div>

          <div className="flex space-x-4">
            <a
              href="https://www.facebook.com/share/17S9sFug74/?mibextid=wwXIfr"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FaFacebook className="text-2xl text-blue-700 hover:text-blue-500 transition" />
            </a>
            <a
              href="https://www.instagram.com/juniorseastech?igsh=MWl1OHdic216anljaA%3D%3D&utm_source=qr"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FaInstagram className="text-2xl text-pink-600 hover:text-pink-400 transition" />
            </a>
            <a
              href="http://www.tiktok.com/@juniorseastech"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FaTiktok className="text-2xl text-[#69C9D0] hover:text-[#EE1D52] transition" />
            </a>
            <a
              href="https://www.linkedin.com/company/juniorseastech/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FaLinkedin className="text-2xl text-blue-500 hover:text-blue-400 transition" />
            </a>
            <a
              href="https://wa.me/2348106165292"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FaWhatsapp className="text-2xl text-green-500 hover:text-green-400 transition" />
            </a>
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FaTwitter className="text-2xl text-blue-400 hover:text-blue-300 transition" />
            </a>
          </div>
          <div className="uppercase flex gap-3 hover:cursor-pointer">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/cookies">Cookies</Link>
          </div>
        </div>
      </Container>
      <Container className="pb-5 px-0">
        <div className="flex items-center justify-center gap-4 invert pt-4 md:justify-end">
          <img
            src="/assets/icons/bankTransferIcon.svg"
            alt="payment-img"
            className="w-7"
          />
          <img
            src="/assets/icons/bitcoinIcon.svg"
            alt="payment-img"
            className="w-7 "
          />
          <img
            src="/assets/icons/visaIcon.svg"
            alt="payment-img"
            className="w-7"
          />
          <img
            src="/assets/icons/masterCardIcon.png"
            alt="payment-img"
            className="w-7"
          />
        </div>
      </Container>
    </div>
  );
};

export default Footer;

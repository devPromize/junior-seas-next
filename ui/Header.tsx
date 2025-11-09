"use client";
import {
  useState,
  useRef,
  useEffect,
  JSXElementConstructor,
  Key,
  ReactElement,
  ReactNode,
  ReactPortal,
} from "react";
import { IoClose, IoSearchOutline } from "react-icons/io5";
import { RiUserFill } from "react-icons/ri";
import { FaChevronDown, FaBars } from "react-icons/fa";
import {
  Menu,
  Transition,
  MenuButton,
  MenuItem,
  MenuItems,
} from "@headlessui/react";
import Container from "./Container";
import { useCategories } from "../hooks/useCategories";
import HeaderCartIcon from "./HeaderCartIcon";
import HeaderWishlistIcon from "./HeaderWishListIcon";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSearchProducts } from "../hooks/useSearchProducts";
import SearchSuggestions from "../ui/SearchSuggestions";
import Portal from "../ui/Portal";
import { useRouter } from "next/navigation";

const headerNavLinks = [
  { title: "Home", to: "/" },
  { title: "Shop", to: "/shop" },
  // { title: "Brands", to: "/brands" },
  { title: "Cart", to: "/cart" },
  { title: "Account", to: "/account" },
  { title: "About Us", to: "/about-us" },
  { title: "Contact Us", to: "/contact-us" },
  { title: "Faqs", to: "/faqs" },
];

const Header = () => {
  const url = usePathname();
  const [searchText, setSearchText] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHeader, setShowHeader] = useState(true);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { data: searchResults = [], isLoading: isSearchLoading } =
    useSearchProducts(searchText);
  const {
    data: categories,
    isLoading: isCategoriesLoading,
    error: categoriesError,
  } = useCategories();

  const router = useRouter();

  // Sticky header effect
  useEffect(() => {
    let lastY = window.scrollY;
    const handleScroll = () => {
      if (categoryDropdownOpen || menuOpen) {
        setShowHeader(true);
        return;
      }
      const currentY = window.scrollY;
      if (currentY <= 0) setShowHeader(true);
      else if (currentY > lastY) setShowHeader(false);
      else if (currentY < lastY) setShowHeader(true);
      lastY = currentY;
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [categoryDropdownOpen, menuOpen]);

  // Close menu when clicking outside (ignore clicks inside portal)
  useEffect(() => {
    const closeMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest(".portal-overlay") || // 👈 ignore portal clicks
        target.closest("#hamburger-btn")
      )
        return;
      if (!target.closest("#mobile-menu")) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <>
      {/* Main header */}
      <div
        className={`w-full bg-[var(--color-white)] sticky top-0 transition-all duration-300 shadow-md z-100 border-b-1 border-b-[var(--color-skyBlue)]
        ${showHeader ? "translate-y-0" : "-translate-y-full"}
      `}
        style={{ willChange: "transform" }}
      >
        <div className="max-w-screen-xl mx-auto h-20 flex items-center justify-between px-2 lg:px-0">
          {/* Logo */}
          <Link href="/">
            <img
              src="/assets/icons/jsLogo.svg"
              alt="logo"
              className="w-40 sm:w-45 md:w-55 bg-[#FFE0C0] invert rounded-sm p-1"
            />
          </Link>

          {/* Search (Desktop) */}
          <div
            ref={containerRef}
            className="hidden md:inline-flex max-w-3xl w-[300px] lg:w-full relative"
          >
            <input
              type="text"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Search Products"
              className="w-full flex-1 rounded-sm text-gray-900 text-lg placeholder:text-base 
            shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 
            focus:ring-0 focus:outline-(--color-skyBlue) sm:text-sm px-4 py-2"
            />

            {searchText ? (
              <div className="absolute top-2.5 right-3 flex items-center gap-2">
                <Link
                  href={`/search?q=${encodeURIComponent(searchText)}`}
                  onClick={() => setShowSuggestions(false)}
                  className="text-sm font-semibold text-blue-600 hover:underline"
                >
                  Search
                </Link>
                <IoClose
                  onClick={() => {
                    setSearchText("");
                    setShowSuggestions(false);
                  }}
                  className="text-xl hover:text-red-500 cursor-pointer duration-200"
                />
              </div>
            ) : (
              <IoSearchOutline className="absolute top-2.5 right-4 text-xl" />
            )}

            <SearchSuggestions
              results={searchResults}
              loading={isSearchLoading}
              visible={showSuggestions && !!searchText.trim()}
              searchText={searchText}
              onSelect={() => {
                setShowSuggestions(false);
                setSearchText("");
              }}
            />
          </div>

          {/* Right icons */}
          <div className="flex items-center gap-x-6 text-2xl">
            <Link
              href="/account"
              className={
                url === "/account" ? "active-link" : "text-(--color-navyBlue)"
              }
            >
              <div className="relative group">
                <RiUserFill className="group-hover:text-(--color-skyBlue) transition-all duration-200 cursor-pointer" />
                <div
                  className="absolute top-7 left-1/2 -translate-x-1/2 hidden group-hover:flex items-center justify-center 
                  px-1 py-1 bg-(--color-navyBlue) text-white text-[10px] rounded-sm border-(--color-skyBlue) border-1"
                >
                  Account
                </div>
              </div>
            </Link>
            <HeaderWishlistIcon />
            <HeaderCartIcon />
          </div>
        </div>

        {/* Navbar & Hamburger */}
        <div className="w-full bg-(--color-navyBlue) text-[var(--color-white)]">
          <Container className="py-1 max-w-4xl flex items-center justify-between">
            <Menu
              as="div"
              className="relative inline-block text-left"
              onMouseEnter={() => setCategoryDropdownOpen(true)}
              onMouseLeave={() => setCategoryDropdownOpen(false)}
              onClick={() => setCategoryDropdownOpen((open) => !open)}
            >
              <MenuButton className="uppercase text-[10px] border-1 font-bold flex items-center gap-1 p-1 hover:text-(--color-columbia-blue) duration-200 cursor-pointer">
                Select Category <FaChevronDown />
              </MenuButton>
              <Transition
                enter="transition-all duration-300"
                enterFrom="opacity-0 scale-y-0"
                enterTo="opacity-100 scale-y-100"
                leave="transition-all duration-200"
                leaveFrom="opacity-100 scale-y-100"
                leaveTo="opacity-0 scale-y-0"
              >
                <MenuItems className="absolute left-1/2 translate-x-[-32%] lg:translate-x-[-50%] mt-1 w-52 origin-top-left bg-white divide-y divide-gray-100 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50 max-h-120 overflow-y-auto">
                  {isCategoriesLoading ? (
                    <MenuItem disabled>
                      <span>Loading...</span>
                    </MenuItem>
                  ) : categoriesError ? (
                    <MenuItem disabled>
                      <span>Error loading categories</span>
                    </MenuItem>
                  ) : (
                    categories &&
                    [...categories]
                      .sort((a, b) =>
                        (a.title ?? "").localeCompare(
                          b.title ?? "",
                          undefined,
                          {
                            sensitivity: "base",
                          }
                        )
                      )
                      .map((item) => (
                        <MenuItem key={String(item.id ?? item.slug)}>
                          <Link
                            href={`/category/${item.slug}`}
                            className="flex gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          >
                            <img
                              src={item.image_url || "/placeholder.png"}
                              alt={item.title}
                              className="w-6 h-6 rounded-md"
                            />
                            {item.title}
                          </Link>
                        </MenuItem>
                      ))
                  )}
                </MenuItems>
              </Transition>
            </Menu>

            {/* Hamburger */}
            <button
              id="hamburger-btn"
              className="md:hidden text-2xl"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <FaBars />
            </button>

            {/* Desktop Links */}
            <div className="hidden md:flex items-center gap-5">
              {headerNavLinks.map(({ title, to }) => (
                <Link
                  key={title}
                  href={to}
                  className={
                    url === to
                      ? "active-link"
                      : "text-[var(--color-white)]/90 hover:text-[var(--color-skyBlue)] duration-200"
                  }
                >
                  <p className="uppercase text-sm font-semibold relative overflow-hidden group cursor-pointer">
                    {title}
                  </p>
                </Link>
              ))}
            </div>
          </Container>
        </div>
      </div>

      {/* ====================== */}
      {/* Mobile Menu + Search */}
      {/* ====================== */}
      <div
        id="mobile-menu"
        className={`fixed top-0 left-0 h-full w-75 bg-[var(--color-navyBlue)] text-[var(--color-white)] z-1000 shadow-lg 
        transition-transform duration-300 ease-in-out transform ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ backgroundColor: "rgba(6, 24, 44, 0.95)" }}
      >
        <Link href="/">
          <img
            src="/assets/icons/jsLogo.svg"
            alt="logo"
            onClick={() => setMenuOpen(false)}
            className="w-45 invert pl-3 pt-2"
          />
        </Link>
        <button
          className="absolute top-2 right-3 text-2xl hover:bg-red-600 duration-200"
          onClick={() => setMenuOpen(false)}
        >
          <IoClose />
        </button>

        {/* Mobile Search Input */}
        <div className="md:hidden">
          <div className="p-5 mt-2 relative">
            <input
              type="text"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Search Products"
              className="w-full rounded-sm text-(--color-white) text-lg placeholder:text-base shadow-sm ring-1 ring-(--color-skyBlue) placeholder:text-gray-400 sm:text-sm px-4 py-3"
            />
            <IoSearchOutline className="absolute top-8 right-8 text-xl" />
          </div>

          {showSuggestions && !!searchText.trim() && (
            <Portal>
              <div
                className="portal-overlay fixed inset-0 z-[9999] bg-white flex flex-col md:hidden"
                onClick={(e) => e.stopPropagation()} // ✅ stops closing when clicked inside
              >
                <div className="sticky top-0 bg-white z-[10000] border-b flex items-center gap-2 p-4">
                  <input
                    autoFocus
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="flex-1 px-3 py-2 border rounded text-gray-800"
                    placeholder="Search products..."
                  />
                  {searchText && (
                    <Link
                      href={`/search?q=${encodeURIComponent(searchText)}`}
                      onClick={() => {
                        setShowSuggestions(false);
                        setMenuOpen(false); // close the sidebar if open
                      }}
                      className="px-2 py-1 text-sm text-blue-600 font-semibold border rounded hover:bg-blue-50"
                    >
                      Search
                    </Link>
                  )}
                  <button
                    className="ml-2 px-3 py-2 text-sm font-medium text-gray-700 border rounded"
                    onClick={() => setShowSuggestions(false)}
                  >
                    Close
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                  {isSearchLoading ? (
                    <p className="text-gray-500 text-center">Searching...</p>
                  ) : searchResults && searchResults.length > 0 ? (
                    <ul className="divide-y divide-gray-100">
                      {searchResults.map((product: any) => (
                        <li key={product.id}>
                          <Link
                            href={`/product/${product.slug}`}
                            className="flex items-center gap-3 p-2 hover:bg-gray-100"
                            onClick={() => setShowSuggestions(false)}
                          >
                            <img
                              src={
                                product.image ||
                                product.images?.[0] ||
                                product.variants?.[0]?.image ||
                                "/placeholder.png"
                              }
                              className="w-12 h-12 rounded object-cover flex-shrink-0"
                            />
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-900">
                                {product.name}
                              </span>

                              {(product.minPrice || product.maxPrice) && (
                                <span className="text-xs text-gray-500">
                                  {product.hasRange
                                    ? `₦${product.minPrice.toLocaleString()} - ₦${product.maxPrice.toLocaleString()}`
                                    : `₦${product.minPrice?.toLocaleString()}`}
                                </span>
                              )}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-500 text-center">
                      No results found
                    </p>
                  )}
                </div>
              </div>
            </Portal>
          )}
        </div>

        {/* Mobile Navigation Links */}
        <div className="flex flex-col">
          {headerNavLinks.map(({ title, to }) => (
            <Link
              key={title}
              href={to}
              className={
                url === to
                  ? "w-full uppercase text-[12px] font-semibold bg-[var(--color-skyBlue)] text-[var(--color-white)] duration-300 cursor-pointer"
                  : "w-full uppercase text-[12px] font-semibold hover:bg-[var(--color-skyBlue)] duration-300 cursor-pointer"
              }
              onClick={() => setTimeout(() => setMenuOpen(false), 100)}
            >
              <p className="pl-5 py-4">{title}</p>
              <div className="h-[0.6px] bg-[var(--color-skyBlue)]/50"></div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
};

export default Header;

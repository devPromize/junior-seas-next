import React from 'react';
import { RiDeleteBin6Line } from 'react-icons/ri';
import { FiPlus, FiMinus } from 'react-icons/fi';
import { useCart, CartItem } from '@/context/CartContext';
import Link from 'next/link';

interface Props {
  item: CartItem;
}

export default function CartProductCard({ item }: Props) {
  const { incrementQuantity, updateQuantity, removeFromCart } = useCart();

  const unitPrice = Number(item.price) || 0;
  const totalPrice = unitPrice * Number(item.quantity);

  return (
    <div className="flex items-center justify-between p-4 rounded-md  border border-(--color-columbia-blue) bg-black/1 ">
      <div className="flex items-center gap-4">
        <Link href={`/products/${item.productId}`}>
        <img src={item.image ?? '/placeholder.png'} alt={item.name} className="w-16 h-16 object-cover rounded" />
        </Link>
        <div>
          <h2 className=" font-bold">{item.name}</h2>
          <p className="text-sm ">₦{unitPrice.toLocaleString()} × {item.quantity}</p>
          <div className="flex items-center mt-2 gap-2">
            <button onClick={() => updateQuantity(item._id, item.quantity - 1)} className="p-1 border rounded hover:bg-gray-100"><FiMinus size={14} /></button>
            <span className="min-w-[24px] text-center">{item.quantity}</span>
            <button onClick={() => incrementQuantity(item._id)} className="p-1 border rounded hover:bg-gray-100"><FiPlus size={14} /></button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-lg font-semibold">₦{totalPrice.toLocaleString()}</span>
        <button onClick={() => removeFromCart(item._id)} className="text-red-500 hover:text-red-700"><RiDeleteBin6Line size={20} /></button>
      </div>
    </div>
  );
}
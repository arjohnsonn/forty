"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

type Props = {};

const NavbarHeader = (props: Props) => {
  const pathname = usePathname();
  const isHomePage = pathname === "/";

  return (
    !isHomePage && (
      <div className="w-full flex justify-between items-center p-3 px-5">
        <Link
          href="/"
          title="Home"
          className="flex items-center space-x-2 transition-colors hover:text-zinc-400"
        >
          <h1 className="text-xl font-bold">Forty</h1>
        </Link>
      </div>
    )
  );
};

export default NavbarHeader;

import React from "react";
import HeaderAuth from "./header-auth";
import NavbarHeader from "./navbar-header";

type Props = {};

const Navbar = (props: Props) => {
  return (
    <nav
      style={{ left: "var(--sidebar-width, 0px)", right: 0 }}
      className="fixed top-0 w-full z-50 flex justify-center h-16 transition-all duration-300 bg-background"
    >
      <NavbarHeader />
      <div className="w-full flex justify-end items-center p-3 px-5 text-sm">
        <HeaderAuth />
      </div>
    </nav>
  );
};

export default Navbar;

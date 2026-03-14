"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Search, Settings, LogOut, User, HelpCircle } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: "#fcfbf8" }}>
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-black/5 bg-white/80 backdrop-blur-sm px-6">
        {/* Logo */}
        <a href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-purple-700 shadow-sm">
            <span className="text-sm font-bold text-white">D</span>
          </div>
          <span className="text-lg font-semibold tracking-tight text-gray-900">
            Doable
          </span>
        </a>

        {/* Center Search */}
        <div className="mx-auto hidden md:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search projects..."
              className="h-9 w-80 rounded-full border-gray-200 bg-gray-50/80 pl-9 text-sm placeholder:text-gray-400 focus-visible:bg-white focus-visible:ring-violet-500/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500 hover:text-gray-700 md:hidden">
            <Search className="h-4.5 w-4.5" />
          </Button>

          <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500 hover:text-gray-700">
            <HelpCircle className="h-4.5 w-4.5" />
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-full ring-2 ring-transparent hover:ring-violet-200 transition-all">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-xs font-medium text-white">
                  U
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">Demo User</p>
                  <p className="text-xs text-muted-foreground">demo@doable.dev</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>
    </div>
  );
}

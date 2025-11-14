"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/lib/auth";

const nav = [
  { href: "/books", label: "All Books" },
  { href: "/purchased", label: "Purchased" },
  { href: "/create", label: "Create" },
  { href: "/account", label: "Account" },
  { href: "/support", label: "Support" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const initials =
    me?.name
      ?.split(" ")
      .map((s) => s[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ||
    (me?.email?.[0]?.toUpperCase() ?? "U");
  return (
    <div className="min-h-dvh">
      <AppBar
        color="inherit"
        position="sticky"
        elevation={0}
        sx={{
          borderBottom: "1px solid hsl(var(--border))",
          backdropFilter: "blur(6px)",
          backgroundColor: "rgba(255,255,255,0.9)",
        }}
      >
        <Toolbar sx={{ maxWidth: "1024px", mx: "auto", width: "100%" }}>
          <Typography
            variant="h6"
            component={Link as any}
            href="/"
            sx={{ flexGrow: 1, textDecoration: "none", color: "inherit" }}
          >
            Kid to Story
          </Typography>
          <Box sx={{ display: { xs: "none", md: "flex" }, gap: 1, mr: 2 }}>
            {nav.map((n) => (
              <Button
                key={n.href}
                component={Link as any}
                href={n.href}
                size="small"
                variant={pathname?.startsWith(n.href) ? "contained" : "text"}
                color={pathname?.startsWith(n.href) ? "primary" : "inherit"}
              >
                {n.label}
              </Button>
            ))}
          </Box>
          {me ? (
            <>
              <Tooltip title={me.email}>
                <IconButton
                  component={Link as any}
                  href="/account"
                  size="small"
                >
                  <Avatar sx={{ width: 32, height: 32 }}>{initials}</Avatar>
                </IconButton>
              </Tooltip>
              <Box
                component="form"
                action="/api/logout"
                method="post"
                sx={{ ml: 1, display: { xs: "none", md: "block" } }}
              >
                <Button type="submit" variant="outlined" size="small">
                  Sign out
                </Button>
              </Box>
            </>
          ) : (
            <Button
              component={Link as any}
              href="/login"
              size="small"
              variant="outlined"
            >
              Login
            </Button>
          )}
        </Toolbar>
      </AppBar>
      <main className="mx-auto max-w-6xl px-4 py-4">{children}</main>
      <footer className="border-t border-[hsl(var(--border))] mt-8">
        <div className="mx-auto max-w-6xl px-4 py-8 text-xs text-gray-500">
          © {new Date().getFullYear()} Kid to Story
        </div>
      </footer>
    </div>
  );
}

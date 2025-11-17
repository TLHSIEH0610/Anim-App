"use client";
import * as React from "react";
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
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMe } from "@/lib/auth";

const nav = [
  { href: "/books", label: "Books" },
  { href: "/purchased", label: "Purchased" },
  { href: "/support", label: "Support" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const qc = useQueryClient();
  const { data: me, refetch } = useQuery({ queryKey: ["me"], queryFn: getMe });
  // Ensure auth UI updates on route changes (e.g., after /api/logout redirect)
  React.useEffect(() => {
    try { qc.invalidateQueries({ queryKey: ["me"] }); } catch {}
  }, [pathname, qc]);
  const [menuEl, setMenuEl] = React.useState<null | HTMLElement>(null);
  const menuOpen = Boolean(menuEl);
  const openMenu = (e: React.MouseEvent<HTMLElement>) => setMenuEl(e.currentTarget);
  const closeMenu = () => setMenuEl(null);
  const initials =
    me?.name
      ?.split(" ")
      .map((s) => s[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ||
    (me?.email?.[0]?.toUpperCase() ?? "U");
  const contentMax = 'max-w-6xl'
  return (
    <div className="min-h-dvh flex flex-col">
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
          <Box sx={{ display: "flex", alignItems: "center", flexGrow: 1 }}>
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <Box
                component="span"
                sx={{
                  height: 32,
                  width: 32,
                  borderRadius: 2,
                  overflow: "hidden",
                  bgcolor: "purple.600",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 1px 2px rgba(15,23,42,0.15)",
                }}
              >
                <Box
                  component="img"
                  src="/landing/logo.png"
                  alt="Kid to Story logo"
                  sx={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                  }}
                />
              </Box>
              <Typography
                variant="h6"
                sx={{ fontWeight: 700, letterSpacing: "-0.02em" }}
              >
                Kid to Story
              </Typography>
            </Link>
          </Box>
          {me && (
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
          )}
          {me ? (
            <>
              <Tooltip title={me.email}>
                <IconButton size="small" onClick={openMenu} onMouseEnter={openMenu} aria-controls={menuOpen ? 'user-menu' : undefined} aria-haspopup="true" aria-expanded={menuOpen ? 'true' : undefined}>
                  <Avatar sx={{ width: 32, height: 32 }}>{initials}</Avatar>
                </IconButton>
              </Tooltip>
              <Menu id="user-menu" anchorEl={menuEl} open={menuOpen} onClose={closeMenu} onClick={closeMenu} transformOrigin={{ horizontal: 'right', vertical: 'top' }} anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}>
                <MenuItem component={Link as any} href="/account/billing">Billing</MenuItem>
                <MenuItem component={Link as any} href="/account">Account</MenuItem>
                <MenuItem component={Link as any} href="/api/logout">Sign out</MenuItem>
              </Menu>
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
      <main className={`flex-1 mx-auto ${contentMax} px-4 py-4`}>{children}</main>
      <footer className="border-t border-[hsl(var(--border))] mt-8">
        <div className={`mx-auto ${contentMax} px-4 py-8 text-xs text-gray-500`}>
          © {new Date().getFullYear()} Kid to Story
        </div>
      </footer>
    </div>
  );
}

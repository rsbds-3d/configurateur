using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Configurateur de Bijoux Rosebuds")]
[assembly: AssemblyDescription("Lanceur Windows du configurateur 3D Rosebuds")]
[assembly: AssemblyCompany("Charles Thierry de Ville d'Avray")]
[assembly: AssemblyProduct("Configurateur de Bijoux Rosebuds")]
[assembly: AssemblyCopyright("Copyright (C) 2026 Charles Thierry de Ville d'Avray")]
[assembly: AssemblyVersion("0.3.0.0")]
[assembly: AssemblyFileVersion("0.3.0.0")]

namespace Rosebuds.Configurateur
{
    internal static class Program
    {
        private const int Port = 8080;
        private const string CacheToken = "20260902-release-v03";
        private const string MutexName = @"Local\RosebudsConfigurateurBijoux";
        private static readonly string RootDirectory = AppDomain.CurrentDomain.BaseDirectory;
        private static readonly string LaunchUrl = "http://localhost:" + Port + "/?v=" + CacheToken;

        private static readonly Dictionary<string, string> MimeTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { ".html", "text/html; charset=utf-8" },
            { ".js", "text/javascript; charset=utf-8" },
            { ".css", "text/css; charset=utf-8" },
            { ".json", "application/json; charset=utf-8" },
            { ".png", "image/png" },
            { ".jpg", "image/jpeg" },
            { ".jpeg", "image/jpeg" },
            { ".webp", "image/webp" },
            { ".gif", "image/gif" },
            { ".svg", "image/svg+xml" },
            { ".ico", "image/x-icon" },
            { ".glb", "model/gltf-binary" },
            { ".gltf", "model/gltf+json" },
            { ".3dm", "application/octet-stream" },
            { ".wasm", "application/wasm" },
            { ".woff", "font/woff" },
            { ".woff2", "font/woff2" }
        };

        [STAThread]
        private static void Main()
        {
            bool isFirstInstance;
            using (Mutex mutex = new Mutex(true, MutexName, out isFirstInstance))
            {
                if (!isFirstInstance)
                {
                    OpenBrowser();
                    return;
                }

                string indexPath = Path.Combine(RootDirectory, "index.html");
                if (!File.Exists(indexPath))
                {
                    ShowError("Le fichier index.html est introuvable dans le dossier de l'application.");
                    return;
                }

                TcpListener listener = new TcpListener(IPAddress.Loopback, Port);
                try
                {
                    listener.Start();
                }
                catch (SocketException)
                {
                    if (IsConfiguratorAvailable())
                    {
                        OpenBrowser();
                        return;
                    }

                    ShowError("Le port " + Port + " est deja utilise par une autre application. Fermez cette application puis relancez le configurateur.");
                    return;
                }

                OpenBrowser();

                try
                {
                    while (true)
                    {
                        TcpClient client = listener.AcceptTcpClient();
                        ThreadPool.QueueUserWorkItem(HandleClient, client);
                    }
                }
                catch (Exception ex)
                {
                    ShowError("Le serveur local du configurateur s'est arrete : " + ex.Message);
                }
                finally
                {
                    listener.Stop();
                }
            }
        }

        private static void HandleClient(object state)
        {
            TcpClient client = state as TcpClient;
            if (client == null)
            {
                return;
            }

            using (client)
            {
                try
                {
                    client.ReceiveTimeout = 5000;
                    client.SendTimeout = 15000;
                    using (NetworkStream stream = client.GetStream())
                    {
                        string request = ReadRequestHeaders(stream);
                        if (String.IsNullOrEmpty(request))
                        {
                            return;
                        }

                        string firstLine = request.Split(new[] { "\r\n" }, StringSplitOptions.None)[0];
                        string[] parts = firstLine.Split(' ');
                        if (parts.Length < 2 || (parts[0] != "GET" && parts[0] != "HEAD"))
                        {
                            SendTextResponse(stream, 405, "Method Not Allowed", "Methode non autorisee");
                            return;
                        }

                        Uri requestUri;
                        if (!Uri.TryCreate("http://127.0.0.1:" + Port + parts[1], UriKind.Absolute, out requestUri))
                        {
                            SendTextResponse(stream, 400, "Bad Request", "Requete invalide");
                            return;
                        }

                        string relativePath = Uri.UnescapeDataString(requestUri.AbsolutePath).TrimStart('/');
                        if (String.IsNullOrWhiteSpace(relativePath))
                        {
                            relativePath = "index.html";
                        }

                        relativePath = relativePath.Replace('/', Path.DirectorySeparatorChar);
                        string fullPath = Path.GetFullPath(Path.Combine(RootDirectory, relativePath));
                        string safeRoot = Path.GetFullPath(RootDirectory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                        if (!fullPath.StartsWith(safeRoot, StringComparison.OrdinalIgnoreCase))
                        {
                            SendTextResponse(stream, 403, "Forbidden", "Acces interdit");
                            return;
                        }

                        if (!File.Exists(fullPath))
                        {
                            SendTextResponse(stream, 404, "Not Found", "Fichier introuvable");
                            return;
                        }

                        SendFileResponse(stream, fullPath, parts[0] == "HEAD");
                    }
                }
                catch
                {
                    // Une navigation annule parfois une requete en cours. Le serveur reste disponible.
                }
            }
        }

        private static string ReadRequestHeaders(NetworkStream stream)
        {
            byte[] buffer = new byte[16384];
            int count = 0;

            while (count < buffer.Length)
            {
                int read = stream.Read(buffer, count, buffer.Length - count);
                if (read <= 0)
                {
                    break;
                }

                count += read;
                if (FindHeaderEnd(buffer, count) >= 0)
                {
                    break;
                }
            }

            return count == 0 ? String.Empty : Encoding.ASCII.GetString(buffer, 0, count);
        }

        private static int FindHeaderEnd(byte[] buffer, int count)
        {
            for (int index = 3; index < count; index++)
            {
                if (buffer[index - 3] == 13 && buffer[index - 2] == 10 && buffer[index - 1] == 13 && buffer[index] == 10)
                {
                    return index - 3;
                }
            }

            return -1;
        }

        private static void SendFileResponse(NetworkStream stream, string filePath, bool headersOnly)
        {
            FileInfo file = new FileInfo(filePath);
            string mimeType;
            if (!MimeTypes.TryGetValue(file.Extension, out mimeType))
            {
                mimeType = "application/octet-stream";
            }

            string headers =
                "HTTP/1.1 200 OK\r\n" +
                "Content-Type: " + mimeType + "\r\n" +
                "Content-Length: " + file.Length + "\r\n" +
                "Cache-Control: no-store\r\n" +
                "X-Rosebuds-Configurator: v0.3-260902\r\n" +
                "Connection: close\r\n\r\n";
            WriteBytes(stream, Encoding.ASCII.GetBytes(headers));

            if (headersOnly)
            {
                return;
            }

            using (FileStream fileStream = File.OpenRead(filePath))
            {
                byte[] buffer = new byte[65536];
                int read;
                while ((read = fileStream.Read(buffer, 0, buffer.Length)) > 0)
                {
                    stream.Write(buffer, 0, read);
                }
            }
        }

        private static void SendTextResponse(NetworkStream stream, int statusCode, string statusText, string message)
        {
            byte[] body = Encoding.UTF8.GetBytes(message);
            string headers =
                "HTTP/1.1 " + statusCode + " " + statusText + "\r\n" +
                "Content-Type: text/plain; charset=utf-8\r\n" +
                "Content-Length: " + body.Length + "\r\n" +
                "Cache-Control: no-store\r\n" +
                "Connection: close\r\n\r\n";
            WriteBytes(stream, Encoding.ASCII.GetBytes(headers));
            WriteBytes(stream, body);
        }

        private static void WriteBytes(NetworkStream stream, byte[] bytes)
        {
            stream.Write(bytes, 0, bytes.Length);
        }

        private static bool IsConfiguratorAvailable()
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + Port + "/");
                request.Timeout = 1500;
                request.ReadWriteTimeout = 1500;
                request.Method = "GET";
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    return response.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        private static void OpenBrowser()
        {
            try
            {
                Process.Start(new ProcessStartInfo(LaunchUrl) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                ShowError("Le navigateur n'a pas pu etre ouvert automatiquement. Ouvrez " + LaunchUrl + "\n\n" + ex.Message);
            }
        }

        private static void ShowError(string message)
        {
            MessageBox.Show(message, "Configurateur de Bijoux Rosebuds", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}

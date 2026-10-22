package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
)

type TMDBMovie struct {
	ID          int     `json:"id"`
	Title       string  `json:"title"`
	Overview    string  `json:"overview"`
	PosterPath  string  `json:"poster_path"`
	ReleaseDate string  `json:"release_date"`
	VoteAverage float64 `json:"vote_average"`
	VoteCount   int     `json:"vote_count"`
}

type MovieDetail struct {
	ID          int         `json:"id"`
	Title       string      `json:"title"`
	Overview    string      `json:"overview"`
	Runtime     int         `json:"runtime"`
	ReleaseDate string      `json:"release_date"`
	VoteAverage float64     `json:"vote_average"`
	VoteCount   int         `json:"vote_count"`
	Genres      []Genre     `json:"genres"`
	Credits     Credits     `json:"credits"`
	Similar     Similar     `json:"similar"`
}

type Genre struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type CastMember struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Character   string `json:"character"`
	ProfilePath string `json:"profile_path"`
	Order       int    `json:"order"`
}

type CrewMember struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	Job  string `json:"job"`
}

type Credits struct {
	Cast []CastMember `json:"cast"`
	Crew []CrewMember `json:"crew"`
}

type Similar struct {
	Results []TMDBMovie `json:"results"`
}

type Server struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Pattern     string `json:"pattern"`
	Quality     string `json:"quality"`
	Load        int    `json:"load"`
	Recommended bool   `json:"recommended"`
}

type Creator struct {
	Name   string `json:"name"`
	Role   string `json:"role"`
	Avatar string `json:"avatar"`
}

type AppConfig struct {
	Servers  []Server  `json:"servers"`
	Creators []Creator `json:"creators"`
}

var tmdbAPIKey string
var tmdbBase = "https://api.themoviedb.org/3"

var appConfig = AppConfig{
	Servers: []Server{
		{ID: "utama", Name: "Server 1 (HD)", Pattern: "https://vidsrc.to/embed/movie/{video_id}", Quality: "1080p", Load: 32, Recommended: true},
		{ID: "cadangan", Name: "Server 2 (Fast)", Pattern: "https://vidsrc.sh/embed/movie/{video_id}", Quality: "720p", Load: 15, Recommended: false},
	},
	Creators: []Creator{
		{Name: "Aisyah Putri", Role: "Dokumenter", Avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80"},
		{Name: "Bayu Mahendra", Role: "Musisi", Avatar: "https://images.unsplash.com/photo-1500648767791-00dcc664aec0?auto=format&fit=crop&w=200&q=80"},
		{Name: "Koli Animation", Role: "Studio Animasi", Avatar: "https://images.unsplash.com/photo-1611162616475-46b9b41f9f9b?auto=format&fit=crop&w=200&q=80"},
		{Name: "Reza Pamungkas", Role: "Sineas", Avatar: "https://images.unsplash.com/photo-1507003181164-6e864c1e1f77?auto=format&fit=crop&w=200&q=80"},
		{Name: "Lintas Pantura", Role: "Kolektif", Avatar: "https://images.unsplash.com/photo-1502685104226-ee32379fef5f?auto=format&fit=crop&w=200&q=80"},
		{Name: "Devi Anjani", Role: "Sineas", Avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d35?auto=format&fit=crop&w=200&q=80"},
	},
}

func init() {
	tmdbAPIKey = os.Getenv("TMDB_API_KEY")
	if tmdbAPIKey == "" {
		tmdbAPIKey = "a3ce3ae3ddb29e9417ffcc2889becf9b"
	}
}

func tmdbGet(path string, params map[string]string) ([]byte, error) {
	u, _ := url.Parse(tmdbBase + path)
	q := u.Query()
	q.Set("api_key", tmdbAPIKey)
	q.Set("language", "id-ID")
	for k, v := range params {
		q.Set(k, v)
	}
	u.RawQuery = q.Encode()

	resp, err := http.Get(u.String())
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("TMDB %d: %s", resp.StatusCode, resp.Status)
	}

	buf := make([]byte, 0, 256*1024)
	tmp := make([]byte, 4096)
	for {
		n, err := resp.Body.Read(tmp)
		if n > 0 {
			buf = append(buf, tmp[:n]...)
		}
		if err != nil {
			break
		}
	}
	return buf, nil
}

func enableCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func writeJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	enableCORS(w)
	json.NewEncoder(w).Encode(data)
}

func handleConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, appConfig)
}

func handleTrending(w http.ResponseWriter, r *http.Request) {
	page := r.URL.Query().Get("page")
	if page == "" {
		page = "1"
	}
	data, err := tmdbGet("/trending/movie/week", map[string]string{"page": page})
	if err != nil {
		http.Error(w, err.Error(), 502)
		return
	}
	enableCORS(w)
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func handleDiscover(w http.ResponseWriter, r *http.Request) {
	genre := r.URL.Query().Get("genre")
	page := r.URL.Query().Get("page")
	if page == "" {
		page = "1"
	}
	data, err := tmdbGet("/discover/movie", map[string]string{
		"page":           page,
		"sort_by":        "popularity.desc",
		"vote_count.gte": "50",
		"with_genres":    genre,
	})
	if err != nil {
		http.Error(w, err.Error(), 502)
		return
	}
	enableCORS(w)
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func handleSearch(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	page := r.URL.Query().Get("page")
	if page == "" {
		page = "1"
	}
	if q == "" {
		writeJSON(w, map[string]interface{}{"results": []interface{}{}, "page": 1, "total_pages": 0})
		return
	}
	data, err := tmdbGet("/search/movie", map[string]string{
		"query":         q,
		"page":          page,
		"include_adult": "false",
	})
	if err != nil {
		http.Error(w, err.Error(), 502)
		return
	}
	enableCORS(w)
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func handleMovieDetail(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 4 {
		http.Error(w, "Movie ID required", 400)
		return
	}
	movieID := parts[3]
	data, err := tmdbGet("/movie/"+movieID, map[string]string{
		"append_to_response": "videos,credits,similar",
	})
	if err != nil {
		http.Error(w, err.Error(), 502)
		return
	}
	enableCORS(w)
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()

	mux.Handle("/", http.FileServer(http.Dir("../docs")))

	mux.HandleFunc("/api/config", handleConfig)
	mux.HandleFunc("/api/trending", handleTrending)
	mux.HandleFunc("/api/discover", handleDiscover)
	mux.HandleFunc("/api/search", handleSearch)
	mux.HandleFunc("/api/movie/", handleMovieDetail)

	log.Printf("Nobar Go backend on :%s (serving docs/ + API)", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

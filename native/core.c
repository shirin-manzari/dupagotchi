#include <fcntl.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <io.h>
#else
#include <unistd.h>
#endif
#include "tamalib/tamalib.h"

static uint32_t pixels[16];
static unsigned icons, frequency, sounding, paused;
static volatile sig_atomic_t quitting;
static const char *save_path;
static u12_t program[6144];

#ifdef _WIN32
/* Node passes UTF-8 paths; use the wide APIs for non-ASCII user folders. */
static int wide_path(const char *path, wchar_t *wide) {
    return MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, path, -1, wide, 4096);
}
static FILE *open_file(const char *path, const char *mode) {
    wchar_t wide[4096], wide_mode[8];
    if (!wide_path(path, wide)) return NULL;
    if (!MultiByteToWideChar(CP_UTF8, 0, mode, -1, wide_mode, 8)) return NULL;
    return _wfopen(wide, wide_mode);
}
#define fopen open_file
#endif

static timestamp_t now_us(void) {
#ifdef _WIN32
    LARGE_INTEGER ticks, frequency;
    QueryPerformanceCounter(&ticks);
    QueryPerformanceFrequency(&frequency);
    return (uint32_t)((ticks.QuadPart / frequency.QuadPart) * 1000000 +
        (ticks.QuadPart % frequency.QuadPart) * 1000000 / frequency.QuadPart);
#else
    struct timespec value;
    clock_gettime(CLOCK_MONOTONIC, &value);
    return (uint32_t)((uint64_t)value.tv_sec * 1000000 + value.tv_nsec / 1000);
#endif
}

static void sleep_us(unsigned microseconds) {
#ifdef _WIN32
    Sleep((microseconds + 999) / 1000);
#else
    struct timespec delay = { microseconds / 1000000, (microseconds % 1000000) * 1000 };
    nanosleep(&delay, NULL);
#endif
}

static void sleep_until(timestamp_t deadline) {
    int32_t remaining = (int32_t)(deadline - now_us());
    if (remaining > 0) {
        sleep_us((unsigned)remaining);
    }
}

static void *allocate(u32_t size) { return malloc(size); }
static void halt(void) { }
static bool_t logging(log_level_t level) { return 0; }
static void log_message(log_level_t level, char *message, ...) { }
static void set_pixel(u8_t x, u8_t y, bool_t value) {
    if (x >= 32 || y >= 16) return;
    uint32_t bit = UINT32_C(1) << x;
    pixels[y] = value ? pixels[y] | bit : pixels[y] & ~bit;
}
static void set_icon(u8_t icon, bool_t value) {
    if (icon >= 8) return;
    icons = value ? icons | (1u << icon) : icons & ~(1u << icon);
}
static void set_frequency(u32_t decihertz) { frequency = decihertz / 10; }
static void play_frequency(bool_t value) { sounding = value; }
static int handle(void) { return quitting; }
static void emit_frame(void) {
    printf("{\"type\":\"frame\",\"rows\":[");
    for (unsigned y = 0; y < 16; y++) printf("%s%u", y ? "," : "", pixels[y]);
    printf("],\"icons\":%u,\"frequency\":%u,\"sounding\":%s,\"paused\":%s}\n",
        icons, frequency, sounding ? "true" : "false", paused ? "true" : "false");
}

/* Store values, never pointers or compiler struct padding. Bump schema when fields change. */
#define STATE_FIELDS(X) \
    X(pc) X(x) X(y) X(a) X(b) X(np) X(sp) X(flags) X(tick_counter) \
    X(clk_timer_2hz_timestamp) X(clk_timer_4hz_timestamp) X(clk_timer_8hz_timestamp) \
    X(clk_timer_16hz_timestamp) X(clk_timer_32hz_timestamp) X(clk_timer_64hz_timestamp) \
    X(clk_timer_128hz_timestamp) X(clk_timer_256hz_timestamp) X(prog_timer_timestamp) \
    X(prog_timer_enabled) X(prog_timer_data) X(prog_timer_rld) X(call_depth) X(cpu_halted)

static size_t state_words(uint32_t *words, int restore) {
    state_t *s = tamalib_get_state();
    size_t n = 0;
#define FIELD(name) do { if (restore) *s->name = words[n]; else words[n] = *s->name; n++; } while (0);
    STATE_FIELDS(FIELD)
#undef FIELD
    for (unsigned i = 0; i < INT_SLOT_NUM; i++) {
#define INTERRUPT(name) do { if (restore) s->interrupts[i].name = words[n]; else words[n] = s->interrupts[i].name; n++; } while (0)
        INTERRUPT(factor_flag_reg); INTERRUPT(mask_reg); INTERRUPT(triggered); INTERRUPT(vector);
#undef INTERRUPT
    }
    for (unsigned i = 0; i < MEM_BUFFER_SIZE; i++, n++) {
        if (restore) s->memory[i] = words[n]; else words[n] = s->memory[i];
    }
    return n;
}

static uint32_t checksum(const uint32_t *words, size_t n) {
    uint32_t hash = 2166136261u;
    for (size_t i = 0; i < n; i++) hash = (hash ^ words[i]) * 16777619u;
    return hash;
}
static int write_word(FILE *file, uint32_t word) {
    unsigned char bytes[4] = { word, word >> 8, word >> 16, word >> 24 };
    return fwrite(bytes, 1, 4, file) == 4;
}
static int read_word(FILE *file, uint32_t *word) {
    unsigned char b[4];
    if (fread(b, 1, 4, file) != 4) return 0;
    *word = (uint32_t)b[0] | (uint32_t)b[1] << 8 | (uint32_t)b[2] << 16 | (uint32_t)b[3] << 24;
    return 1;
}
static int save_state(void) {
    uint32_t words[2048];
    size_t count = state_words(words, 0);
    char temporary[4096];
    if (snprintf(temporary, sizeof temporary, "%s.tmp", save_path) >= (int)sizeof temporary) return 0;
    FILE *file = fopen(temporary, "wb");
    if (!file) return 0;
    int ok = write_word(file, 0x54414d41) && write_word(file, 1) &&
        write_word(file, (uint32_t)count) && write_word(file, checksum(words, count));
    for (size_t i = 0; ok && i < count; i++) ok = write_word(file, words[i]);
    if (fflush(file)) ok = 0;
#ifdef _WIN32
    if (_commit(_fileno(file))) ok = 0;
#else
    if (fsync(fileno(file))) ok = 0;
#endif
    if (fclose(file)) ok = 0;
#ifdef _WIN32
    wchar_t source[4096], target[4096];
    if (!wide_path(temporary, source) || !wide_path(save_path, target)) return 0;
    if (ok && MoveFileExW(source, target, MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) return 1;
    DeleteFileW(source);
#else
    if (ok && rename(temporary, save_path) == 0) return 1;
    unlink(temporary);
#endif
    return 0;
}
static int restore_state(void) {
    FILE *file = fopen(save_path, "rb");
    if (!file) return 0;
    uint32_t words[2048], expected[2048], magic, version, count, digest;
    size_t expected_count = state_words(expected, 0);
    int ok = read_word(file, &magic) && read_word(file, &version) &&
        read_word(file, &count) && read_word(file, &digest);
    ok = ok && magic == 0x54414d41 && version == 1 && count == expected_count && count <= 2048;
    for (size_t i = 0; ok && i < count; i++) ok = read_word(file, &words[i]);
    if (ok) ok = fgetc(file) == EOF && checksum(words, count) == digest;
    fclose(file);
    if (!ok) { fprintf(stderr, "Ignoring incompatible or damaged save file\n"); return 0; }
    state_words(words, 1);
    tamalib_refresh_hw();
    cpu_sync_ref_timestamp();
    return 1;
}

static void command(const char *line) {
    if (line[0] >= 'A' && line[0] <= 'C' && line[1] == ' ' && (line[2] == '0' || line[2] == '1')) {
        tamalib_set_button((button_t)(line[0] - 'A'), line[2] == '1' ? BTN_STATE_PRESSED : BTN_STATE_RELEASED);
    } else if (!strcmp(line, "P 1") || !strcmp(line, "P 0")) {
        paused = line[2] == '1';
        cpu_sync_ref_timestamp();
    } else if (!strcmp(line, "S")) {
        puts(save_state() ? "{\"type\":\"saved\"}" : "{\"type\":\"error\",\"message\":\"Could not save progress\"}");
    } else if (!strcmp(line, "Q")) quitting = 1;
}
static void read_commands(void) {
    static char line[128];
    static size_t length;
    char incoming[128];
    int count;
    for (;;) {
#ifdef _WIN32
        HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
        DWORD available, received;
        if (!PeekNamedPipe(input, NULL, 0, NULL, &available, NULL)) { quitting = 1; return; }
        if (!available) return;
        DWORD wanted = available < sizeof incoming ? available : (DWORD)sizeof incoming;
        if (!ReadFile(input, incoming, wanted, &received, NULL)) { quitting = 1; return; }
        count = (int)received;
#else
        count = (int)read(STDIN_FILENO, incoming, sizeof incoming);
#endif
        if (count <= 0) break;
        for (int i = 0; i < count; i++) {
            if (incoming[i] == '\n') { line[length] = 0; command(line); length = 0; }
            else if (incoming[i] == '\r') continue;
            else if (length < sizeof line - 1) line[length++] = incoming[i];
        }
    }
    if (count == 0) quitting = 1;
}
static void stop(int signal_number) { quitting = 1; }

static int core_main(int argc, char **argv) {
    if (argc < 3) { fprintf(stderr, "Usage: tamogachi-core ROM SAVE [--paused]\n"); return 2; }
    FILE *rom = fopen(argv[1], "rb");
    if (!rom) { perror("ROM"); return 2; }
    unsigned char bytes[12289];
    size_t size = fread(bytes, 1, sizeof bytes, rom);
    fclose(rom);
    if (size != 12288) { fprintf(stderr, "Expected a 12288-byte P1 ROM\n"); return 2; }
    for (unsigned i = 0; i < 6144; i++) program[i] = (u12_t)bytes[i * 2] << 8 | bytes[i * 2 + 1];
    save_path = argv[2];
    paused = argc > 3 && !strcmp(argv[3], "--paused");
    setvbuf(stdout, NULL, _IONBF, 0);
    signal(SIGTERM, stop); signal(SIGINT, stop);
#ifndef _WIN32
    signal(SIGPIPE, stop);
    fcntl(STDIN_FILENO, F_SETFL, fcntl(STDIN_FILENO, F_GETFL) | O_NONBLOCK);
#endif
    hal_t hal = {
        .malloc = allocate, .free = free, .halt = halt, .is_log_enabled = logging,
        .log = log_message, .sleep_until = sleep_until, .get_timestamp = now_us,
        .update_screen = emit_frame, .set_lcd_matrix = set_pixel, .set_lcd_icon = set_icon,
        .set_frequency = set_frequency, .play_frequency = play_frequency, .handler = handle,
    };
    tamalib_register_hal(&hal);
    if (tamalib_init(program, NULL, 1000000)) { fprintf(stderr, "Emulator initialization failed\n"); return 2; }
    int restored = restore_state();
    printf("{\"type\":\"ready\",\"restored\":%s}\n", restored ? "true" : "false");
    timestamp_t frame_time = now_us(), save_time = frame_time;
    while (!quitting) {
        read_commands();
        if (!paused) tamalib_step();
        else sleep_us(2000);
        timestamp_t now = now_us();
        if (now - frame_time >= 33333) { emit_frame(); frame_time = now; }
        if (now - save_time >= 5000000) {
            puts(save_state() ? "{\"type\":\"saved\"}" : "{\"type\":\"error\",\"message\":\"Autosave failed\"}");
            save_time = now;
        }
    }
    int saved = save_state();
    tamalib_release();
    return saved ? 0 : 3;
}

#ifdef _WIN32
int wmain(int argc, wchar_t **wide_argv) {
    char **argv = calloc((size_t)argc + 1, sizeof *argv);
    if (!argv) return 2;
    for (int i = 0; i < argc; i++) {
        int length = WideCharToMultiByte(CP_UTF8, 0, wide_argv[i], -1, NULL, 0, NULL, NULL);
        argv[i] = malloc((size_t)length);
        if (!length || !argv[i]) return 2;
        WideCharToMultiByte(CP_UTF8, 0, wide_argv[i], -1, argv[i], length, NULL, NULL);
    }
    int result = core_main(argc, argv);
    for (int i = 0; i < argc; i++) free(argv[i]);
    free(argv);
    return result;
}
#else
int main(int argc, char **argv) { return core_main(argc, argv); }
#endif

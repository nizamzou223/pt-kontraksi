import 'package:flutter/material.dart';
import 'app_widgets.dart';

// ══════════════════════════════════════════════════════════════
// APP DROPDOWN — Custom, ringan, tidak double-trigger
// Pengganti DropdownButtonFormField yang berat
// ══════════════════════════════════════════════════════════════
class AppDropdown<T> extends StatefulWidget {
  final T? value;
  final List<AppDropdownItem<T>> items;
  final ValueChanged<T?> onChanged;
  final String hint;
  final String? label;
  final bool required;
  final String? errorText;
  final Widget? prefixIcon;
  final double maxHeight;

  const AppDropdown({
    super.key,
    required this.items,
    required this.onChanged,
    this.value,
    this.hint = 'Pilih...',
    this.label,
    this.required = false,
    this.errorText,
    this.prefixIcon,
    this.maxHeight = 300,
  });

  @override
  State<AppDropdown<T>> createState() => _AppDropdownState<T>();
}

class _AppDropdownState<T> extends State<AppDropdown<T>>
    with SingleTickerProviderStateMixin {
  bool _open = false;
  late AnimationController _ctrl;
  late Animation<double> _fadeAnim;
  late Animation<double> _scaleAnim;
  final _layerLink = LayerLink();
  OverlayEntry? _overlay;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 180));
    _fadeAnim  = CurvedAnimation(parent: _ctrl, curve: Curves.easeOut);
    _scaleAnim = Tween(begin: 0.94, end: 1.0).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOut));
  }

  @override
  void dispose() {
    _closeDropdown();
    _ctrl.dispose();
    super.dispose();
  }

  void _toggleDropdown() {
    if (_open) {
      _closeDropdown();
    } else {
      _openDropdown();
    }
  }

  void _openDropdown() {
    if (_open) return;
    setState(() => _open = true);
    _overlay = _buildOverlay();
    Overlay.of(context).insert(_overlay!);
    _ctrl.forward();
  }

  void _closeDropdown() {
    if (!_open) return;
    _ctrl.reverse().then((_) {
      _overlay?.remove();
      _overlay = null;
      if (mounted) setState(() => _open = false);
    });
  }

  void _selectItem(T? val) {
    widget.onChanged(val);
    _closeDropdown();
  }

  OverlayEntry _buildOverlay() {
    final renderBox = context.findRenderObject() as RenderBox;
    final size = renderBox.size;

    return OverlayEntry(
      builder: (ctx) => GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: _closeDropdown,
        child: Stack(children: [
          // Backdrop
          Positioned.fill(child: Container(color: Colors.transparent)),
          // Dropdown menu
          CompositedTransformFollower(
            link: _layerLink,
            showWhenUnlinked: false,
            offset: Offset(0, size.height + 4),
            child: Material(
              color: Colors.transparent,
              child: FadeTransition(
                opacity: _fadeAnim,
                child: ScaleTransition(
                  scale: _scaleAnim,
                  alignment: Alignment.topCenter,
                  child: Container(
                    width: size.width,
                    constraints: BoxConstraints(maxHeight: widget.maxHeight),
                    decoration: BoxDecoration(
                      color: context.cCard,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: context.cBorder),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.08),
                          blurRadius: 16, offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: ListView.builder(
                        shrinkWrap: true,
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        itemCount: widget.items.length,
                        itemBuilder: (_, i) {
                          final item = widget.items[i];
                          final isSelected = item.value == widget.value;
                          return InkWell(
                            onTap: () => _selectItem(item.value),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 100),
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                              color: isSelected ? AppColors.brand50 : Colors.transparent,
                              child: Row(children: [
                                if (item.icon != null) ...[
                                  Icon(item.icon, size: 16, color: isSelected ? AppColors.brand600 : context.cSub),
                                  const SizedBox(width: 8),
                                ],
                                Expanded(
                                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                    Text(item.label,
                                      style: TextStyle(
                                        fontSize: 16,
                                        fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                                        color: isSelected ? AppColors.brand700 : context.cText,
                                      ),
                                      maxLines: 1, overflow: TextOverflow.ellipsis,
                                    ),
                                    if (item.subtitle != null)
                                      Text(item.subtitle!,
                                        style: TextStyle(fontSize: 15, color: context.cMuted),
                                        maxLines: 1, overflow: TextOverflow.ellipsis),
                                  ]),
                                ),
                                if (isSelected)
                                  const Icon(Icons.check_rounded, size: 16, color: AppColors.brand600),
                              ]),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final selectedItem = widget.items.where((i) => i.value == widget.value).firstOrNull;
    final hasError = widget.errorText != null;

    return CompositedTransformTarget(
      link: _layerLink,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (widget.label != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: RichText(text: TextSpan(
              text: widget.label,
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: context.cText),
              children: widget.required
                  ? [const TextSpan(text: ' *', style: TextStyle(color: Color(0xFFDC2626)))]
                  : [],
            )),
          ),
        GestureDetector(
          onTap: _toggleDropdown,
          behavior: HitTestBehavior.opaque,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            decoration: BoxDecoration(
              color: context.cCard,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: hasError ? const Color(0xFFEF4444) : _open ? AppColors.brand600 : context.cBorder,
                width: _open ? 2 : 1,
              ),
            ),
            child: Row(children: [
              if (widget.prefixIcon != null) ...[widget.prefixIcon!, const SizedBox(width: 8)],
              Expanded(
                child: selectedItem != null
                    ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(selectedItem.label,
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500, color: context.cText),
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                        if (selectedItem.subtitle != null)
                          Text(selectedItem.subtitle!,
                            style: TextStyle(fontSize: 15, color: context.cSub)),
                      ])
                    : Text(widget.hint,
                        style: TextStyle(fontSize: 16, color: context.cMuted)),
              ),
              const SizedBox(width: 6),
              AnimatedRotation(
                turns: _open ? 0.5 : 0,
                duration: const Duration(milliseconds: 180),
                child: Icon(Icons.keyboard_arrow_down_rounded, size: 20, color: context.cMuted),
              ),
            ]),
          ),
        ),
        if (hasError)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4),
            child: Text(widget.errorText!, style: const TextStyle(fontSize: 15, color: Color(0xFFDC2626))),
          ),
      ]),
    );
  }
}

class AppDropdownItem<T> {
  final T value;
  final String label;
  final String? subtitle;
  final IconData? icon;
  const AppDropdownItem({required this.value, required this.label, this.subtitle, this.icon});
}

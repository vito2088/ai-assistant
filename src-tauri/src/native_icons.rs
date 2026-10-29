//! Cached Direct2D geometry generated from the Web UI's SVG icon source.
use std::collections::HashMap;
use windows::{core::Interface,Win32::Graphics::Direct2D::{Common::*,*}};
use windows_numerics::Matrix3x2;
use super::native_editor::{point,area};
pub(super) enum Cmd {M(f32,f32),L(f32,f32),C(f32,f32,f32,f32,f32,f32),Z}
pub(super) enum Shape {Path(&'static[Cmd],bool,f32),Rect(f32,f32,f32,f32,f32,bool,f32),Ellipse(f32,f32,f32,f32,bool,f32)}
struct Part {geometry:ID2D1Geometry,fill:bool,stroke:f32}
pub struct Icons {items:HashMap<&'static str,Vec<Part>>,style:ID2D1StrokeStyle}
impl Icons {
    pub unsafe fn new(factory:&ID2D1Factory)->Result<Self,String>{
        let style=factory.CreateStrokeStyle(&D2D1_STROKE_STYLE_PROPERTIES {startCap:D2D1_CAP_STYLE_ROUND,endCap:D2D1_CAP_STYLE_ROUND,dashCap:D2D1_CAP_STYLE_ROUND,lineJoin:D2D1_LINE_JOIN_ROUND,..Default::default()},None).map_err(|e|e.to_string())?;
        let mut items=HashMap::new();
        for (name,shapes) in super::native_icon_data::ICONS {
            let mut parts=Vec::new();
            for shape in *shapes {
                let (geometry,fill,stroke):(ID2D1Geometry,bool,f32)=match shape {
                    Shape::Rect(x,y,w,h,r,fill,stroke)=>(factory.CreateRoundedRectangleGeometry(&D2D1_ROUNDED_RECT {rect:area(*x,*y,*w,*h),radiusX:*r,radiusY:*r}).and_then(|g|g.cast()).map_err(|e|e.to_string())?,*fill,*stroke),
                    Shape::Ellipse(x,y,rx,ry,fill,stroke)=>(factory.CreateEllipseGeometry(&D2D1_ELLIPSE {point:point(*x,*y),radiusX:*rx,radiusY:*ry}).and_then(|g|g.cast()).map_err(|e|e.to_string())?,*fill,*stroke),
                    Shape::Path(commands,fill,stroke)=>{
                        let path=factory.CreatePathGeometry().map_err(|e|e.to_string())?;
                        let sink=path.Open().map_err(|e|e.to_string())?;let mut open=false;
                        for command in *commands {match *command {
                            Cmd::M(x,y)=>{if open {sink.EndFigure(D2D1_FIGURE_END_OPEN);}sink.BeginFigure(point(x,y),if *fill {D2D1_FIGURE_BEGIN_FILLED}else{D2D1_FIGURE_BEGIN_HOLLOW});open=true;},
                            Cmd::L(x,y)=>sink.AddLine(point(x,y)),
                            Cmd::C(x1,y1,x2,y2,x,y)=>sink.AddBezier(&D2D1_BEZIER_SEGMENT {point1:point(x1,y1),point2:point(x2,y2),point3:point(x,y)}),
                            Cmd::Z=>{sink.EndFigure(D2D1_FIGURE_END_CLOSED);open=false;}
                        }}
                        if open {sink.EndFigure(D2D1_FIGURE_END_OPEN);}sink.Close().map_err(|e|e.to_string())?;
                        (path.cast().map_err(|e|e.to_string())?,*fill,*stroke)
                    }
                };
                parts.push(Part {geometry,fill,stroke});
            }
            items.insert(*name,parts);
        }
        Ok(Self {items,style})
    }
    pub unsafe fn draw(&self,target:&ID2D1RenderTarget,ink:&ID2D1SolidColorBrush,name:&str,r:D2D_RECT_F,scale:f32){
        let Some(parts)=self.items.get(name)else{return;};
        let size=18.0*scale;let factor=size/24.0;
        let mut old=Matrix3x2::default();target.GetTransform(&mut old);
        target.SetTransform(&Matrix3x2 {M11:factor,M12:0.0,M21:0.0,M22:factor,M31:(r.left+r.right-size)/2.0,M32:(r.top+r.bottom-size)/2.0});
        for part in parts {if part.fill {target.FillGeometry(&part.geometry,ink,None);}if part.stroke>0.0 {target.DrawGeometry(&part.geometry,ink,part.stroke,&self.style);}}
        target.SetTransform(&old);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shared_svg_geometry_is_valid_and_stays_inside_its_viewbox() {
        unsafe {
            let factory:ID2D1Factory=D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED,None).unwrap();
            let icons=Icons::new(&factory).unwrap();
            assert_eq!(icons.items.len(),super::super::native_icon_data::ICONS.len());
            for (name,parts) in icons.items {
                assert!(!parts.is_empty());
                for p in parts {
                    let r=if p.stroke>0.0 {p.geometry.GetWidenedBounds(p.stroke,&icons.style,None,0.25).unwrap()}else{p.geometry.GetBounds(None).unwrap()};
                    assert!(r.left.is_finite()&&r.top.is_finite()&&r.right.is_finite()&&r.bottom.is_finite(),"{name}: {r:?}");
                    assert!(r.left>=0.0&&r.top>=0.0&&r.right<=24.0&&r.bottom<=24.0,"{name}: {r:?}");
                }
            }
        }
    }
}
